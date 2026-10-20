/**
 * Answer 410 Gone for an endpoint that has been retired.
 *
 * FastAPI is the only identity provider: it issues every token both
 * applications accept, and it owns the user records. These Express endpoints
 * predate that and would still create users of their own shape and sign
 * tokens with the shared key, so they are closed here, in front of the
 * controller, rather than deleted. The implementations stay in the tree while
 * the decision to remove them is still open.
 *
 * 410 rather than 404: the route existed, the behaviour is deliberately gone,
 * and a caller should not retry.
 */
const gone = (message) => (req, res) => {
  return res.status(410).json({
    message,
    identityProvider: "fastapi",
  });
};

module.exports = gone;
