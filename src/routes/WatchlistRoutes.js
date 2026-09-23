import express from "express";
import {addTo} from '../Controller/watchlistController.js'
import {authMiddleware} from '../middleware/auMiddleware.js'
const router = express.Router();
router.use(authMiddleware)
router.post("/",addTo);
export default router;