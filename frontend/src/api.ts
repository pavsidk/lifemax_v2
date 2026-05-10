import Constants from "expo-constants";

// Automatically uses your Mac's LAN IP — works on simulators and physical devices.
const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
const BASE = `http://${host}:5001/api`;

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export type Goal = "confidence" | "appearance" | "professional";

export interface DynamicQuestion {
  scenario: string;
  options: string[];
}

export interface SkillLevel { level: number; label: string }

export interface OnboardResult {
  path: SkillLevel[];
  goal: Goal;
  first_quest: string;
}

export interface QuestState {
  quest: string;
  xp_reward: number;
  balance_usd: number;
  current_level: number;
  xp: number;
  xp_to_next: number;
}

export interface CompleteResult {
  message: string;
  xp_gained: number;
  new_quest: string;
  current_level: number;
  xp: number;
  xp_to_next: number;
}

export interface SkillsState {
  path: SkillLevel[];
  current_level: number;
  xp: number;
  xp_to_next: number;
  goal: Goal;
}

export interface Transaction {
  kind: "deposit" | "refund" | "deduction";
  title: string;
  amount: number;
  date: string;
}

export interface VaultState {
  balance_usd: number;
  transactions: Transaction[];
}

export interface ProfileState {
  name: string;
  goal: Goal;
  current_level: number;
  xp: number;
  xp_to_next: number;
  quests_completed: number;
  confidence_rate: number;
  presence_rate: number;
  summary: string;
  mongo_synced: boolean;
}

export const api = {
  googleAuth: (accessToken: string) =>
    post<{ new_user: boolean; user_id: string; name: string }>("/auth/google", { access_token: accessToken }),

  emailAuth: (email: string, password: string) =>
    post<{ new_user: boolean; user_id: string }>("/auth/email", { email, password }),

  onboardInit: (userId: string, staticAnswers: [string, string, string]) =>
    post<{ questions: DynamicQuestion[] }>("/onboard/init", {
      user_id: userId,
      static_answers: staticAnswers,
    }),

  onboardFinalize: (params: {
    userId: string;
    name: string;
    depositUsd: number;
    pairs: { sq1: string; sq2: string; sq3: string; dq1: string; dq2: string; dq3: string };
  }) =>
    post<OnboardResult>("/onboard/finalize", {
      user_id: params.userId,
      name: params.name,
      deposit_usd: params.depositUsd,
      pairs: params.pairs,
    }),

  onboard: (userId: string, anxietyLevel: number, goal: Goal, depositUsd: number) =>
    post<OnboardResult>("/onboard", {
      user_id: userId,
      anxiety_level: anxietyLevel,
      goal,
      deposit_usd: depositUsd,
    }),

  getCurrentQuest: (userId: string) =>
    get<QuestState>("/quests/current", { user_id: userId }),

  completeQuest: (userId: string, outcome: "success" | "rejected" | "bailed") =>
    post<CompleteResult>("/quests/complete", { user_id: userId, outcome }),

  skipQuest: (userId: string) =>
    post<{ new_quest: string }>("/quests/skip", { user_id: userId }),

  getSkills: (userId: string) =>
    get<SkillsState>("/skills", { user_id: userId }),

  getVault: (userId: string) =>
    get<VaultState>("/vault", { user_id: userId }),

  deposit: (userId: string, amountUsd: number) =>
    post<{ balance_usd: number; message: string }>("/vault/deposit", {
      user_id: userId,
      amount_usd: amountUsd,
    }),

  emergencyRefund: (userId: string) =>
    post<{ refunded_usd: number; message: string }>("/vault/emergency-refund", {
      user_id: userId,
    }),

  getProfile: (userId: string) =>
    get<ProfileState>("/profile", { user_id: userId }),

  setProfileName: (userId: string, name: string) =>
    post<{ name: string }>("/profile/name", { user_id: userId, name }),
};
