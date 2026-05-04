export type User = {
  id: number;
  name: string;
  email: string;
  created_at: string;
};

export type Post = {
  id: number;
  title: string;
  content: string;
  author_id: number;
  created_at: string;
};

export type Comment = {
  id: number;
  content: string;
  post_id: number;
  author_id: number;
  created_at: string;
};
