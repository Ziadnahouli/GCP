import { UserProfile, UserStatus } from './profile';

export interface FriendItem {
  id: string; // friendship id
  friend: UserProfile;
  created_at: string;
}

export interface FriendRequestItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  sender?: UserProfile;
  receiver?: UserProfile;
  type: 'incoming' | 'outgoing';
}

export interface BlockedUserItem {
  id: string;
  blocked_id: string;
  blocked_user: UserProfile;
  created_at: string;
}

export interface SocialState {
  friends: FriendItem[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  blockedUsers: BlockedUserItem[];
  isLoading: boolean;
  error: string | null;
}
