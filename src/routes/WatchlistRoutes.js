import express from "express";
import {addTo} from '../Controller/watchlistController.js'
const router = express.Router();
router.post("/",addTo);



export default router;