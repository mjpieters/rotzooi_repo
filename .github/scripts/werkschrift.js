// @ts-check

const pr_id = 'PR_kwDONmtVJM6G3Wg-'

/**
 * @template T
 * @typedef {Object} NodeQuery<T>
 * @property {T} node
 */
/**
 * @template T
 * @typedef {Object} MutationInput<T>
 * @property {T} input
 */
/**
 * @template T
 * @typedef {Object} Connection<T>
 * @property {T[]} nodes
 */
/**
 * @template T
 * @typedef {Object} Edge<T>
 * @property {T} node
 */
 
/** 
 * @typedef {Object} _SparseIssueComment
 * @property {string} id
 * @property {boolean} isMinimized
 * @property {boolean} viewerDidAuthor
 * @property {string} body
 * 
 * @typedef {Object} _SparsePullRequestNode
 * @property {Connection<_SparseIssueComment>} comments
 * 
 * @typedef {Object} CommentsForPrVariables
 * @property {string} id - The node id of the PR to fetch comments for
 * 
 * @typedef {NodeQuery<_SparsePullRequestNode>} CommentsForPrResponse
 */

const commentsForPr = `
  query CommentsForPR($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on PullRequest {
        comments(first: 100, after: $cursor) {
          nodes {
            id
            isMinimized
            viewerDidAuthor
            body
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }
`

/**
 * @typedef {Object} SparseIssueCommentURL
 * @property {string} url
 * 
 * @typedef {Object} _UpdatedIssueComment
 * @property {SparseIssueCommentURL} issueComment
 * 
 * @typedef {Object} UpdateCommentResponse
 * @property {_UpdatedIssueComment} updateIssueComment
 * 
 * @typedef {Object} UpdateCommentVariables
 * @property {string} id
 * @property {string} body
 */

const updateCommentMutation = `
  mutation UpdateCommentMutation($input: UpdateIssueCommentInput!) {
    updateIssueComment(input: $input) {
      issueComment { url }
    }
  }
`

/**
 * @typedef {Object} _AddCommentPayload
 * @property {Edge<SparseIssueCommentURL>} commentEdge
 * 
 * @typedef {Object} AddCommentResponse
 * @property {_AddCommentPayload} addComment
 * 
 * @typedef {Object} AddCommentVariables
 * @property {string} subjectId
 * @property {string} body
 */

const addCommentMutation = `
  mutation AddCommentMutation($input: AddCommentInput!) {
    addComment(input: $input) {
      commentEdge { node { url } }
    }
  }
`

class Commenter {
  /**
   * @param {GitHub} client 
   * @param {string} node_id 
   * @param {Record<string, *>} context 
   */
  constructor(client, node_id, context) {
    this.client = client
    this.pr = node_id
    this.comment_context = context
  }

  /**
   * HTML comment used to mark a comment as being from this action
   * @returns {string}
   */
  get comment_marker() {
    const context = Object.entries(this.comment_context)
      .filter(([_, value]) => typeof(value) === 'string')
      .map(([name, value]) => `${name}='${value}'`)
      .join(", ")
    return `<!-- pyright-analysis-action ${context} -->`
  }

  /**
   * Find the node id of an existing comment
   * @returns {Promise<string | null>}
   */
  async existing_comment_id() {
    const marker = this.comment_marker
    /** @type {CommentsForPrVariables} */
    const variables = {"id": this.pr}
    /** @type {AsyncIterable<CommentsForPrResponse>} */
    const pages = this.client.graphql.paginate.iterator(commentsForPr, variables)
    for await (const page of pages) {
      console.log(`commentsForPr response: ${JSON.stringify(page, undefined, 2)}`)
      const comment = page.node.comments.nodes
        .find((comment) => comment.viewerDidAuthor && !comment.isMinimized && comment.body.includes(marker))
      if (comment !== undefined) { return comment.id }
    }
    return null
  }

  /**
   * Post or update a comment on this PR
   * 
   * If a pre-existing comment is found, this is updated, otherwise a new
   * comment is created. Returns the comment URL.
   * 
   * @param {string} summary
   * @returns {Promise<string>}
   */
  async post_or_update_comment(summary) {
    const body = `${summary}\n\n${this.comment_marker}`
    const comment_id = await this.existing_comment_id()
    /** @type {SparseIssueCommentURL} */
    var comment
    if (comment_id !== null) {
      // update
      /** @type {MutationInput<UpdateCommentVariables>} */
      const variables = {"input": {"id": comment_id, "body": body}}
      const result = /** @type {UpdateCommentResponse} */ (await this.client.graphql(updateCommentMutation, variables))
      console.log(`updateCommentMutation response: ${JSON.stringify(result, undefined, 2)}`)
      comment = result.updateIssueComment.issueComment
    } else {
      // create
      /** @type {MutationInput<AddCommentVariables>} */
      const variables = {"input": {"subjectId": this.pr, "body": body}}
      const result = /** @type {AddCommentResponse} */ (await this.client.graphql(addCommentMutation, variables))
      console.log(`addCommentMutation response: ${JSON.stringify(result, undefined, 2)}`)
      comment = result.addComment.commentEdge.node
    }
    return comment.url
  }


}

/**
 * @typedef {ReturnType<import('@octokit/plugin-paginate-graphql').paginateGraphql>} PaginateGraphQLInterface
 * @typedef {import('github-script').AsyncFunctionArguments["github"] & PaginateGraphQLInterface} GitHub
 * 
 * @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments
 */
module.exports = async ({core, context, require}) => {
    console.log("Hade, verden!")
    await core.group('Context', async () => console.log(JSON.stringify(context, undefined, 2)))
    
    const githubDefaults = require('@actions/github/lib/utils').githubDefaults
    const getOctokit = require("@actions/github").getOctokit
    const paginateGraphQL = require("@octokit/plugin-paginate-graphql")

    const token = core.getInput("github-token", {required: true})
    const github = /** @type {GitHub} */ (getOctokit(token, githubDefaults, paginateGraphQL.paginateGraphql))

    const commenter = new Commenter(github, pr_id, {"workflow": context.workflow, "jobid": context.job})
    await commenter.post_or_update_comment("## This is a test comment\n\nI command you to _admire it_\n")
}
