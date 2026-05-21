import type {
  CommentListItem,
  PostListItem,
} from '../../application/ports.js';

export type SerializedPostMediaItem = {
  type: 'image' | 'video';
  mediaId: string;
};

export type SerializedPost = {
  postId: string;
  organizationId: string;
  authorUserId: string;
  text: string;
  media: SerializedPostMediaItem[];
  moderationStatus: 'visible' | 'hidden';
  likeCount: number;
  commentCount: number;
  viewCount: number;
  viewerLiked: boolean;
  editedAt: string | null;
  createdAt: string;
};

export type SerializedComment = {
  commentId: string;
  postId: string;
  authorUserId: string;
  text: string;
  moderationStatus: 'visible' | 'hidden';
  createdAt: string;
};

export function serializePost(p: PostListItem): SerializedPost {
  return {
    postId: p.postId as string,
    organizationId: p.organizationId as string,
    authorUserId: p.authorUserId as string,
    text: p.text,
    media: p.media.map((m) => ({ type: m.type, mediaId: m.mediaId as string })),
    moderationStatus: p.moderationStatus,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    viewCount: p.viewCount,
    viewerLiked: p.viewerLiked,
    editedAt: p.editedAt === null ? null : p.editedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializeComment(c: CommentListItem): SerializedComment {
  return {
    commentId: c.commentId as string,
    postId: c.postId as string,
    authorUserId: c.authorUserId as string,
    text: c.text,
    moderationStatus: c.moderationStatus,
    createdAt: c.createdAt.toISOString(),
  };
}
