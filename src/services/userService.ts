import { File, Paths } from 'expo-file-system';
import { UserProfile } from '../types';

const profileFile = () => new File(Paths.document, 'user_profile.json');

export async function loadProfile(): Promise<UserProfile | null> {
  try {
    const file = profileFile();
    if (!file.exists) return null;
    const raw = await file.text();
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  profileFile().write(JSON.stringify(profile));
}

export function generateUserId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
