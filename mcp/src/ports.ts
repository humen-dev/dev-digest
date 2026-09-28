// src/ports.ts — ring 2: the ONLY way tools reach DevDigest. Implemented by api/http-client.ts (ring 3).
import type {
  ApiRepo, ApiPull, ApiAgent, ApiStartedRun, ApiRun, ApiActiveRun, ApiReview, ApiConventionBoard,
} from './domain/types.js';

export interface DevDigestApi {
  listRepos(): Promise<ApiRepo[]>; //                                        GET  /repos
  listPulls(repoId: string): Promise<ApiPull[]>; //                          GET  /repos/:id/pulls   (timeout 2x)
  warmPull(prId: string): Promise<void>; //                                  GET  /pulls/:id         (timeout 2x, body discarded)
  listAgents(): Promise<ApiAgent[]>; //                                      GET  /agents
  startReview(prId: string, agentId: string): Promise<ApiStartedRun>; //    POST /pulls/:id/review {agentId} → runs[0]
  listRuns(prId: string): Promise<ApiRun[]>; //                              GET  /pulls/:id/runs
  listActiveRuns(prId: string): Promise<ApiActiveRun[]>; //                  GET  /pulls/:id/runs/active
  listReviews(prId: string): Promise<ApiReview[]>; //                        GET  /pulls/:id/reviews
  getConventions(repoId: string): Promise<ApiConventionBoard>; //            GET  /repos/:id/conventions
}
// Every method throws ApiUnreachableError or ApiError (src/errors.ts) and nothing else.
