import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.server_api import ServerApi

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)


def _env(k: str) -> str:
    return (os.getenv(k) or "").strip().strip('"').strip("'")


_db_name = _env("MONGO_DB_NAME") or "lifemax"
_client: MongoClient | None = None


def _connection_uri() -> str:
    uri = _env("MONGO_URI") or _env("MONGODB_URI")
    if uri:
        return uri
    user, pw, host = _env("MONGO_USER"), _env("MONGO_PASSWORD"), _env("MONGO_HOST")
    if user and pw and host:
        host = host.replace("mongodb+srv://", "").split("/")[0]
        return (
            f"mongodb+srv://{quote_plus(user)}:{quote_plus(pw)}@{host}/"
            "?retryWrites=true&w=majority&appName=lifemax"
        )
    raise RuntimeError(
        f"MongoDB env missing. In {_ENV_PATH} set either:\n"
        '  MONGO_URI="mongodb+srv://..." (from Atlas → Connect),\n'
        "  OR MONGO_USER, MONGO_PASSWORD, MONGO_HOST."
    )


def _get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(_connection_uri(), server_api=ServerApi("1"))
        _client.admin.command("ping")
    return _client


def _metrics():
    return _get_client()[_db_name]["metrics"]


def _users_col():
    return _get_client()[_db_name]["users"]


def _creds_col():
    return _get_client()[_db_name]["credentials"]


# ---------------------------------------------------------------------------
# Credentials (bcrypt password hashes)
# ---------------------------------------------------------------------------

def save_credential(email: str, hashed_pw: bytes) -> None:
    _creds_col().update_one(
        {"email": email},
        {"$set": {"email": email, "password_hash": hashed_pw}},
        upsert=True,
    )


def get_credential(email: str) -> bytes | None:
    doc = _creds_col().find_one({"email": email})
    return doc["password_hash"] if doc else None


# ---------------------------------------------------------------------------
# Full user state (for auth + server-restart hydration)
# ---------------------------------------------------------------------------

def save_user(user_id: str, user_dict: dict) -> None:
    doc = dict(user_dict)
    doc["userId"] = user_id
    doc.pop("_id", None)
    _users_col().update_one({"userId": user_id}, {"$set": doc}, upsert=True)


def load_user(user_id: str) -> dict | None:
    doc = _users_col().find_one({"userId": user_id})
    if doc:
        doc.pop("_id", None)
        doc.pop("userId", None)
        return doc
    return None


def user_exists(user_id: str) -> bool:
    return _users_col().count_documents({"userId": user_id}, limit=1) > 0


# ---------------------------------------------------------------------------
# Profile analytics (AI analysis cache in metrics collection)
# ---------------------------------------------------------------------------

def upsert_profile(user_id: str, user_name: str, confidence_rate: float, presence_rate: float, summary: str) -> None:
    _metrics().update_one(
        {"userId": user_id},
        {"$set": {
            "userId": user_id,
            "userName": user_name,
            "confidenceRate": confidence_rate,
            "presenceRate": presence_rate,
            "summary": summary,
        }},
        upsert=True,
    )


def get_profile(user_id: str) -> dict | None:
    doc = _metrics().find_one({"userId": user_id})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc
