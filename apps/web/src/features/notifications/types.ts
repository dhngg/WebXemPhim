export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}
