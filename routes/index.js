const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: 'API de Bee Bright funcionando correctamente.' });
});

module.exports = router;
