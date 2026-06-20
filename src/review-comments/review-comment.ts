export interface CodeflowReviewComment {
  id: string;
  databaseId: number | null;
  author: string | null;
  authorAssociation: string | null;
  body: string;
  path: string | null;
  line: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  url: string | null;
  isMinimized: boolean;
  viewerCanUpdate: boolean;
  viewerCanDelete: boolean;
}
