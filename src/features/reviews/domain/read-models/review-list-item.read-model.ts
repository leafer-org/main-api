export type ReviewListItemReadModel = {
  reviewId: string;
  authorId: string;
  targetType: string;
  targetId: string;
  rating: number;
  text: string | null;
  status: string;
  replyText: string | null;
  repliedAt: Date | null;
  isMine: boolean;
  isPending: boolean;
  createdAt: Date;
};
