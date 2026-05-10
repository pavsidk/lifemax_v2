import os
import json
import urllib.request
import urllib.parse
import bcrypt
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

try:
    import mongo as _mongo
    _MONGO_OK = True
except Exception:
    _MONGO_OK = False

app = Flask(__name__)
CORS(app)

# In-memory store (swap for MongoDB in production)
users = {}

SKILL_PATHS = {
    "confidence": [
        {"level": 1, "label": "Presence"},
        {"level": 2, "label": "Energy"},
        {"level": 3, "label": "Small talk"},
        {"level": 4, "label": "Conversational skills"},
        {"level": 5, "label": "Social connection"},
    ],
    "appearance": [
        {"level": 1, "label": "First impression"},
        {"level": 2, "label": "Body language"},
        {"level": 3, "label": "Style"},
        {"level": 4, "label": "Charisma"},
        {"level": 5, "label": "Magnetism"},
    ],
    "professional": [
        {"level": 1, "label": "Clarity"},
        {"level": 2, "label": "Assertiveness"},
        {"level": 3, "label": "Team dynamics"},
        {"level": 4, "label": "Leadership"},
        {"level": 5, "label": "Executive presence"},
    ],
}

BATCH_SIZE = 5


def generate_quest_batch(goal: str, level: int, context: str = "") -> list[str]:
    """Ask Gemini for 5 quests in one call. Returns a list of quest strings."""
    prompt = (
        f"You are a confidence coach. The user is working on '{goal}' at level {level}/5. "
        f"{context}"
        f"Generate exactly {BATCH_SIZE} different, short, safe, real-world social challenges "
        f"they can do in a public place. Each challenge must be under 30 words.THE CHALLENGE MUST NOT BE CREEPY OR HARMFUL TO OTHERS, AND SHOULD NOT BE UNCOMFORTABLE OR EMBARRASSING FOR THE USER OR OTHERS. FOCUS ON KNOWN PEOPLE RATHER THAN COMPLETE STRANGERS UNLESS THEY SAY THEY DONT HAVE MANY FRIENDS. STRANGERS CAN BE FINE, LIKE HELPING A STRANGER IF THEY ARE IN NEED, HOWEVER NOTHING WEIRD LIKE SMILE WHILE MAKING EYE CONTACT WITH A STRANGER. ANYTHING TO DO WITH EYE CONTACT SHOULD ONLY BE WHEN HAVING A CONVERSATION, NOT WHILE JUST SMILING, THAT IS CREEPY."
        f"Return only a numbered list like:\n1. ...\n2. ...\n3. ...\n4. ...\n5. ..."
    )
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        result = model.generate_content(prompt)
        lines = result.text.strip().split("\n")
        quests = []
        for line in lines:
            line = line.strip()
            if line and line[0].isdigit():
                # strip leading "1. " etc.
                quest = line.split(".", 1)[-1].strip()
                if quest:
                    quests.append(quest)
        # fallback: if parsing went wrong, split by newline
        if len(quests) < 2:
            quests = [l.strip() for l in lines if len(l.strip()) > 10]
        return quests[:BATCH_SIZE]
    except Exception as e:
        return [f"[Gemini error: {e}]"]


def ask_gemini(prompt: str) -> str:
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        result = model.generate_content(prompt)
        return result.text.strip()
    except Exception as e:
        return f"[Gemini error: {e}]"


def pop_quest(user: dict) -> str:
    """Pop the next quest from the queue. Refill batch if empty."""
    if not user["quest_queue"]:
        user["quest_queue"] = generate_quest_batch(user["goal"], user["current_level"])
    return user["quest_queue"].pop(0) if user["quest_queue"] else "Go say hi to a stranger!"


def _get_user(user_id: str) -> dict | None:
    """Memory-first lookup; hydrates from MongoDB on cache miss (e.g. server restart)."""
    if user_id in users:
        return users[user_id]
    if _MONGO_OK:
        try:
            data = _mongo.load_user(user_id)
            if data:
                users[user_id] = data
                return data
        except Exception:
            pass
    return None


def _persist_user(user_id: str) -> None:
    """Save current in-memory user state to MongoDB (best-effort)."""
    if _MONGO_OK:
        try:
            _mongo.save_user(user_id, users[user_id])
        except Exception:
            pass


def _verify_google_token(access_token: str) -> dict | None:
    """Call Google's userinfo endpoint to verify token and get user info."""
    url = f"https://www.googleapis.com/oauth2/v1/userinfo?access_token={urllib.parse.quote(access_token)}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.route("/api/auth/email", methods=["POST"])
def auth_email():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or "@" not in email:
        return jsonify({"error": "Valid email required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if not _MONGO_OK:
        return jsonify({"error": "MongoDB not connected — cannot authenticate"}), 503

    stored_hash = _mongo.get_credential(email)

    if stored_hash:
        # Existing account — verify password
        if not bcrypt.checkpw(password.encode(), stored_hash):
            return jsonify({"error": "Incorrect password"}), 401
        return jsonify({"new_user": False, "user_id": email})
    else:
        # New account — hash and store password
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
        _mongo.save_credential(email, hashed)
        return jsonify({"new_user": True, "user_id": email})


@app.route("/api/auth/google", methods=["POST"])
def auth_google():
    data = request.get_json(silent=True) or {}
    access_token = data.get("access_token", "")
    if not access_token:
        return jsonify({"error": "access_token required"}), 400

    info = _verify_google_token(access_token)
    if not info or "email" not in info:
        return jsonify({"error": "Invalid or expired Google token"}), 401

    email = info["email"]
    name = info.get("name") or info.get("given_name") or email.split("@")[0]

    user = _get_user(email)
    if user:
        return jsonify({"new_user": False, "user_id": email, "name": user.get("name", name)})

    return jsonify({"new_user": True, "user_id": email, "name": name})


# ---------------------------------------------------------------------------
# Onboarding
# ---------------------------------------------------------------------------

def _generate_dynamic_questions(static_answers: list) -> list:
    prompt = (
        f"A user answered these baseline questions:\n"
        f"1. Social anxiety: {static_answers[0]}\n"
        f"2. What they want to improve: {static_answers[1]}\n"
        f"3. Social environment: {static_answers[2]}\n\n"
        f"Generate exactly 3 short scenario-based follow-up questions, each with exactly 3 short answer options.\n"
        f"Return ONLY valid JSON (no markdown, no extra text):\n"
        f'[{{"scenario": "...", "options": ["option A", "option B", "option C"]}}, '
        f'{{"scenario": "...", "options": ["option A", "option B", "option C"]}}, '
        f'{{"scenario": "...", "options": ["option A", "option B", "option C"]}}]'
    )
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        result = model.generate_content(prompt)
        text = result.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        qs = json.loads(text.strip())
        if isinstance(qs, list) and len(qs) >= 3:
            return qs[:3]
    except Exception:
        pass
    return [
        {"scenario": "You walk into a crowded room and know nobody. What do you do?",
         "options": ["Find a corner and wait", "Join the nearest group", "Go straight to the host"]},
        {"scenario": "A colleague dismisses your idea in a meeting. How do you react?",
         "options": ["Let it go", "Calmly restate it", "Follow up privately"]},
        {"scenario": "You want to talk to someone new. What stops you most?",
         "options": ["Fear of rejection", "Not knowing what to say", "Overthinking their reaction"]},
    ]


def _analyze_onboarding_pairs(pairs: dict) -> tuple:
    prompt = (
        f"Based on these onboarding answers, pick the best goal and estimate anxiety.\n"
        f"Answers: {json.dumps(pairs)}\n"
        f"Goal must be one of: confidence, appearance, professional.\n"
        f"Anxiety is 1 (low) to 5 (high).\n"
        f"Return ONLY valid JSON: {{\"goal\": \"confidence\", \"anxiety_level\": 3}}"
    )
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        result = model.generate_content(prompt)
        text = result.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text.strip())
        goal = data.get("goal", "confidence")
        if goal not in SKILL_PATHS:
            goal = "confidence"
        anxiety = max(1, min(5, int(data.get("anxiety_level", 3))))
        return goal, anxiety
    except Exception:
        return "confidence", 3


@app.route("/api/onboard/init", methods=["POST"])
def onboard_init():
    data = request.get_json(silent=True) or {}
    static_answers = data.get("static_answers", ["", "", ""])
    qs = _generate_dynamic_questions(static_answers)
    return jsonify({"questions": qs})


@app.route("/api/onboard/finalize", methods=["POST"])
def onboard_finalize():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "guest")
    name = (data.get("name") or "Anonymous").strip()
    deposit = float(data.get("deposit_usd", 0))
    pairs = data.get("pairs", {})

    goal, anxiety = _analyze_onboarding_pairs(pairs)
    path = SKILL_PATHS[goal]

    context = f"The user's social anxiety is around {anxiety}/5. Start with easy challenges. "
    quest_queue = generate_quest_batch(goal, 1, context)
    first_quest = quest_queue.pop(0) if quest_queue else "Go say hi to a stranger!"

    transactions = []
    if deposit > 0:
        transactions.append({"kind": "deposit", "title": "Initial deposit", "amount": deposit, "date": "Today"})

    users[user_id] = {
        "name": name,
        "goal": goal,
        "path": path,
        "anxiety_level": anxiety,
        "current_level": 1,
        "xp": 0,
        "xp_to_next": 250,
        "deposit_usd": deposit,
        "balance_usd": deposit,
        "transactions": transactions,
        "active_quest": first_quest,
        "quest_queue": quest_queue,
        "completed_quests": [],
    }
    _persist_user(user_id)

    return jsonify({"path": path, "goal": goal, "first_quest": first_quest, "name": name})


@app.route("/api/onboard", methods=["POST"])
def onboard():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "guest")
    anxiety = data.get("anxiety_level", 3)
    goal = data.get("goal", "confidence")
    deposit = float(data.get("deposit_usd", 0))

    if goal not in SKILL_PATHS:
        goal = "confidence"

    path = SKILL_PATHS[goal]

    context = f"The user rated their social anxiety {anxiety}/5. Start easy. "
    quest_queue = generate_quest_batch(goal, 1, context)
    first_quest = quest_queue.pop(0) if quest_queue else "Go say hi to a stranger!"

    users[user_id] = {
        "goal": goal,
        "path": path,
        "current_level": 1,
        "xp": 0,
        "xp_to_next": 250,
        "deposit_usd": deposit,
        "balance_usd": deposit,
        "transactions": [
            {"kind": "deposit", "title": "Initial deposit", "amount": deposit, "date": "Today"}
        ],
        "active_quest": first_quest,
        "quest_queue": quest_queue,
        "completed_quests": [],
    }

    return jsonify({"path": path, "goal": goal, "first_quest": first_quest})


# ---------------------------------------------------------------------------
# Quests
# ---------------------------------------------------------------------------

@app.route("/api/quests/current", methods=["GET"])
def current_quest():
    user_id = request.args.get("user_id", "guest")
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found. Complete onboarding first."}), 404

    return jsonify({
        "quest": user["active_quest"],
        "xp_reward": 50,
        "balance_usd": user["balance_usd"],
        "current_level": user["current_level"],
        "xp": user["xp"],
        "xp_to_next": user["xp_to_next"],
        "quests_remaining": len(user["quest_queue"]),
    })


@app.route("/api/quests/complete", methods=["POST"])
def complete_quest():
    """Body: { user_id, outcome: "success" | "rejected" | "bailed" }"""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "guest")
    outcome = data.get("outcome", "success")

    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    completed = user["active_quest"]
    user["completed_quests"].append({"quest": completed, "outcome": outcome})

    goal = user["goal"]

    if outcome == "success":
        xp_gained = 50
        user["xp"] += xp_gained
        if user["xp"] >= user["xp_to_next"] and user["current_level"] < 5:
            user["current_level"] += 1
            user["xp"] = 0
            # level up — clear queue so next batch is generated at new level
            user["quest_queue"] = []
        message = "Great job! You crushed it."

    elif outcome == "rejected":
        xp_gained = 20
        user["xp"] += xp_gained
        message = ask_gemini(
            "Give a 1-sentence encouraging message to someone who just got rejected during a social challenge. Be real, not cheesy."
        )

    else:  # bailed
        xp_gained = 0
        message = "No sweat — here's a fresh one. You've got this."

    new_quest = pop_quest(user)
    user["active_quest"] = new_quest
    _persist_user(user_id)

    return jsonify({
        "message": message,
        "xp_gained": xp_gained,
        "new_quest": new_quest,
        "current_level": user["current_level"],
        "xp": user["xp"],
        "xp_to_next": user["xp_to_next"],
        "quests_remaining": len(user["quest_queue"]),
    })


@app.route("/api/quests/skip", methods=["POST"])
def skip_quest():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "guest")

    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    new_quest = pop_quest(user)
    user["active_quest"] = new_quest
    _persist_user(user_id)

    return jsonify({
        "new_quest": new_quest,
        "quests_remaining": len(user["quest_queue"]),
    })


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

@app.route("/api/skills", methods=["GET"])
def get_skills():
    user_id = request.args.get("user_id", "guest")
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "path": user["path"],
        "current_level": user["current_level"],
        "xp": user["xp"],
        "xp_to_next": user["xp_to_next"],
        "goal": user["goal"],
    })


# ---------------------------------------------------------------------------
# Vault
# ---------------------------------------------------------------------------

@app.route("/api/vault", methods=["GET"])
def get_vault():
    user_id = request.args.get("user_id", "guest")
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "balance_usd": user["balance_usd"],
        "transactions": user["transactions"],
    })


@app.route("/api/vault/deposit", methods=["POST"])
def deposit():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "guest")
    amount = float(data.get("amount_usd", 0))

    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if amount <= 0:
        return jsonify({"error": "Amount must be greater than 0"}), 400

    total = user["balance_usd"] + amount
    if total > 20:
        return jsonify({"error": f"Max balance is $20. You can add up to ${20 - user['balance_usd']:.2f}."}), 400

    user["balance_usd"] = total
    user["transactions"].append({
        "kind": "deposit",
        "title": "Deposit",
        "amount": amount,
        "date": "Today",
    })
    _persist_user(user_id)

    return jsonify({"balance_usd": user["balance_usd"], "message": f"${amount:.2f} added to your vault."})


@app.route("/api/vault/emergency-refund", methods=["POST"])
def emergency_refund():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "guest")

    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    subscription_fee = 1.00
    refund_amount = max(0.0, user["balance_usd"] - subscription_fee)
    user["balance_usd"] = 0.0
    user["transactions"].append({
        "kind": "refund",
        "title": "Emergency refund",
        "amount": refund_amount,
        "date": "Today",
    })
    _persist_user(user_id)

    return jsonify({
        "refunded_usd": refund_amount,
        "message": f"${refund_amount:.2f} refund queued. Subscription fee (${subscription_fee:.2f}) retained.",
    })


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

def _compute_rates(user: dict) -> tuple[float, float]:
    """Derive confidence + presence rates (0-100) from quest history."""
    history = user.get("completed_quests", [])
    total = len(history)
    if total == 0:
        base = max(10.0, (5 - user.get("anxiety_level", 3)) * 10.0)
        return base, base

    successes = sum(1 for q in history if q["outcome"] == "success")
    rejections = sum(1 for q in history if q["outcome"] == "rejected")
    bails = sum(1 for q in history if q["outcome"] == "bailed")

    # Confidence = success + partial credit for rejections (they still tried)
    confidence = min(100.0, ((successes * 1.0 + rejections * 0.5) / total) * 100)
    # Boost by level progress
    level_boost = (user.get("current_level", 1) - 1) * 8
    confidence = min(100.0, confidence + level_boost)

    # Presence = engagement consistency (anything but bail counts as showing up)
    presence = min(100.0, ((successes + rejections) / total) * 100)
    presence = min(100.0, presence + (user.get("xp", 0) / user.get("xp_to_next", 250)) * 15)

    return round(confidence, 1), round(presence, 1)


def _gemini_profile_summary(user: dict, confidence: float, presence: float) -> str:
    history = user.get("completed_quests", [])
    total = len(history)
    prompt = (
        f"You are a confidence coach. This user is working on '{user.get('goal','confidence')}'. "
        f"Stats: {total} quests attempted, level {user.get('current_level',1)}/5, "
        f"confidence rate {confidence}%, presence rate {presence}%. "
        f"Write one punchy 2-sentence summary of their progress and one actionable tip. Don't use exact number of challenges but if they did many use a word like 'many'."
        f"No therapy-speak. Be direct and human. Don't directly mention the confidence or presence rates. Ensure that higher rate means more quests completed."
    )
    return ask_gemini(prompt)


@app.route("/api/profile", methods=["GET"])
def get_profile():
    user_id = request.args.get("user_id", "guest")
    force = request.args.get("force", "false").lower() == "true"
    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    current_level = user.get("current_level", 1)
    last_analyzed_level = user.get("_last_analyzed_level", -1)
    name = user.get("name", "Anonymous")

    if current_level != last_analyzed_level or force:
        confidence, presence = _compute_rates(user)
        summary = _gemini_profile_summary(user, confidence, presence)
        user["_last_analyzed_level"] = current_level
        user["_cached_confidence"] = confidence
        user["_cached_presence"] = presence
        user["_cached_summary"] = summary

        if _MONGO_OK:
            try:
                _mongo.upsert_profile(user_id, name, confidence, presence, summary)
            except Exception:
                pass
    else:
        confidence = user.get("_cached_confidence", 0.0)
        presence = user.get("_cached_presence", 0.0)
        summary = user.get("_cached_summary", "Complete some quests to get your analysis.")

    return jsonify({
        "name": name,
        "goal": user.get("goal"),
        "current_level": current_level,
        "xp": user.get("xp", 0),
        "xp_to_next": user.get("xp_to_next", 250),
        "quests_completed": len(user.get("completed_quests", [])),
        "confidence_rate": confidence,
        "presence_rate": presence,
        "summary": summary,
        "mongo_synced": _MONGO_OK,
    })


@app.route("/api/profile/name", methods=["POST"])
def set_profile_name():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id", "guest")
    name = (data.get("name") or "").strip()

    user = _get_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not name:
        return jsonify({"error": "Name cannot be empty"}), 400

    user["name"] = name
    _persist_user(user_id)
    return jsonify({"name": name})


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=int(os.environ.get("PORT", 5001)))
