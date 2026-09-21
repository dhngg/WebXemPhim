import express from "express";
const router = express.Router();
router.get("/",(req,res)=>{
    res.json({message:"get"});
});

router.put("/",(req,res)=>{
    res.json({message:"put"});
});
router.post("/",(req,res)=>{
    res.json({message:"post"});
});
router.delete("/",(req,res)=>{
    res.json({message:"delete"});
});
export default router;