import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import {
  CommentQueryPort,
  PostQueryPort,
} from '../../application/ports.js';
import { CreateCommentInteractor } from '../../application/use-cases/create-comment.interactor.js';
import { DeleteCommentInteractor } from '../../application/use-cases/delete-comment.interactor.js';
import { DeletePostInteractor } from '../../application/use-cases/delete-post.interactor.js';
import { EditPostInteractor } from '../../application/use-cases/edit-post.interactor.js';
import { LikePostInteractor } from '../../application/use-cases/like-post.interactor.js';
import { PublishPostInteractor } from '../../application/use-cases/publish-post.interactor.js';
import { UnlikePostInteractor } from '../../application/use-cases/unlike-post.interactor.js';
import { serializeComment, serializePost } from './serialize.js';
import { throwDomainError } from './throw-domain-error.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { OrganizationActorPort } from '@/kernel/application/ports/organization-actor.js';
import {
  type MediaId,
  OrganizationId,
  PostCommentId,
  PostId,
  type UserId,
} from '@/kernel/domain/ids.js';

@Controller()
export class PostsController {
  public constructor(
    private readonly publishPost: PublishPostInteractor,
    private readonly editPostUC: EditPostInteractor,
    private readonly deletePostUC: DeletePostInteractor,
    private readonly likePostUC: LikePostInteractor,
    private readonly unlikePostUC: UnlikePostInteractor,
    private readonly createCommentUC: CreateCommentInteractor,
    private readonly deleteCommentUC: DeleteCommentInteractor,
    private readonly postQuery: PostQueryPort,
    private readonly commentQuery: CommentQueryPort,
    @Inject(OrganizationActorPort) private readonly orgActor: OrganizationActorPort,
  ) {}

  // ─── Posts ───────────────────────────────────────────────────────────────

  @Post('organizations/:orgId/posts')
  @HttpCode(201)
  public async publish(
    @Param('orgId') orgId: string,
    @Body() body: PublicBody['publishPost'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['publishPost']> {
    const result = await this.publishPost.execute({
      organizationId: OrganizationId.raw(orgId),
      authorUserId: user.userId,
      text: body.text,
      media: body.media.map((m) => ({ type: m.type, mediaId: m.mediaId as MediaId })),
    });
    if (isLeft(result)) throwDomainError(result.error);
    return { postId: result.value.postId as string };
  }

  @Get('organizations/:orgId/posts')
  @Public()
  public async listByOrg(
    @Param('orgId') orgIdRaw: string,
    @CurrentUser() user: JwtUserPayload | null,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PublicResponse['getOrganizationPosts']> {
    const orgId = OrganizationId.raw(orgIdRaw);
    const viewerUserId = user?.userId ?? null;
    const includeHidden =
      viewerUserId !== null
        ? await this.orgActor.canActAs(orgId, viewerUserId, 'posts.publish')
        : false;

    const page = await this.postQuery.findByOrganization(orgId, viewerUserId, {
      cursor,
      limit: limit === undefined ? undefined : Number(limit),
      includeHidden,
    });
    return {
      posts: page.posts.map(serializePost),
      nextCursor: page.nextCursor,
    };
  }

  @Get('posts/:postId')
  @Public()
  public async getDetail(
    @Param('postId') postIdRaw: string,
    @CurrentUser() user: JwtUserPayload | null,
  ): Promise<PublicResponse['getPostDetail']> {
    const postId = PostId.raw(postIdRaw);
    const viewerUserId = user?.userId ?? null;
    const post = await this.postQuery.findById(postId, viewerUserId);
    if (post === null) throw new HttpException({ code: 'post_not_found' }, 404);

    if (post.moderationStatus === 'hidden') {
      const canSee =
        viewerUserId !== null &&
        ((post.authorUserId as string) === (viewerUserId as string) ||
          (await this.orgActor.canActAs(post.organizationId, viewerUserId, 'posts.publish')));
      if (!canSee) throw new HttpException({ code: 'post_not_found' }, 404);
    }
    return serializePost(post);
  }

  @Patch('posts/:postId')
  @HttpCode(204)
  public async edit(
    @Param('postId') postIdRaw: string,
    @Body() body: PublicBody['editPost'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.editPostUC.execute({
      postId: PostId.raw(postIdRaw),
      actorUserId: user.userId,
      text: body.text,
      media: body.media?.map((m) => ({ type: m.type, mediaId: m.mediaId as MediaId })),
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  @Delete('posts/:postId')
  @HttpCode(204)
  public async delete(
    @Param('postId') postIdRaw: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deletePostUC.execute({
      postId: PostId.raw(postIdRaw),
      actorUserId: user.userId,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }

  // ─── Likes ───────────────────────────────────────────────────────────────

  @Put('posts/:postId/like')
  public async like(
    @Param('postId') postIdRaw: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['likePost']> {
    const postId = PostId.raw(postIdRaw);
    const result = await this.likePostUC.execute({ postId, userId: user.userId });
    if (isLeft(result)) throwDomainError(result.error);
    const post = await this.postQuery.findById(postId, user.userId);
    return { liked: true as const, likeCount: post === null ? 0 : post.likeCount };
  }

  @Delete('posts/:postId/like')
  public async unlike(
    @Param('postId') postIdRaw: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['unlikePost']> {
    const postId = PostId.raw(postIdRaw);
    const result = await this.unlikePostUC.execute({ postId, userId: user.userId });
    if (isLeft(result)) throwDomainError(result.error);
    const post = await this.postQuery.findById(postId, user.userId);
    return { liked: false as const, likeCount: post === null ? 0 : post.likeCount };
  }

  // ─── Comments ────────────────────────────────────────────────────────────

  @Post('posts/:postId/comments')
  @HttpCode(201)
  public async createComment(
    @Param('postId') postIdRaw: string,
    @Body() body: PublicBody['createPostComment'],
    @CurrentUser() user: JwtUserPayload,
  ): Promise<PublicResponse['createPostComment']> {
    const result = await this.createCommentUC.execute({
      postId: PostId.raw(postIdRaw),
      authorUserId: user.userId,
      text: body.text,
    });
    if (isLeft(result)) throwDomainError(result.error);
    return { commentId: result.value.commentId as string };
  }

  @Get('posts/:postId/comments')
  @Public()
  public async listComments(
    @Param('postId') postIdRaw: string,
    @CurrentUser() user: JwtUserPayload | null,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<PublicResponse['getPostComments']> {
    const postId = PostId.raw(postIdRaw);
    const post = await this.postQuery.findById(postId, user?.userId ?? null);
    if (post === null) throw new HttpException({ code: 'post_not_found' }, 404);

    const viewerUserId: UserId | null = user?.userId ?? null;
    const includeHidden =
      viewerUserId !== null &&
      (await this.orgActor.canActAs(post.organizationId, viewerUserId, 'posts.moderate-comments'));

    // Hidden post check: остальные пользователи получают 404 на коммент-листинг,
    // если пост виден только сотрудникам/автору.
    if (post.moderationStatus === 'hidden') {
      const canSee =
        viewerUserId !== null &&
        ((post.authorUserId as string) === (viewerUserId as string) ||
          (await this.orgActor.canActAs(post.organizationId, viewerUserId, 'posts.publish')));
      if (!canSee) throw new HttpException({ code: 'post_not_found' }, 404);
    }

    const page = await this.commentQuery.findByPost(postId, viewerUserId, {
      cursor,
      limit: limit === undefined ? undefined : Number(limit),
      includeHidden,
    });
    return {
      comments: page.comments.map(serializeComment),
      nextCursor: page.nextCursor,
    };
  }

  @Delete('comments/:commentId')
  @HttpCode(204)
  public async deleteComment(
    @Param('commentId') commentIdRaw: string,
    @CurrentUser() user: JwtUserPayload,
  ): Promise<void> {
    const result = await this.deleteCommentUC.execute({
      commentId: PostCommentId.raw(commentIdRaw),
      actorUserId: user.userId,
    });
    if (isLeft(result)) throwDomainError(result.error);
  }
}
