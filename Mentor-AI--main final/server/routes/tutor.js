const express = require('express');
const router = express.Router();

router.post('/start', (req, res) => {
  res.json({ message: "Tutor session started" });
});

module.exports = router;
