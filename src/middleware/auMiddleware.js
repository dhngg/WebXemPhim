import jwt from 'jsonwebtoken'
import {prisma} from "../config/db.js"

//xem token tuwf resquest
//xem token no co valid k
const authMiddleware = async (req,res,next)=>{
    let token;
    if(req.headers.authorization && req.headers.authorization.startsWith("Bearer")){
        token = req.headers.authorization.split(" ")[1] // de tach cais chu beared ra
    }else if(req.cookies?.jwt){
        token = req.cookies.jwt;
    }
    if(!token){
        return res.status(401).json({
            error:"not authorized, no token provided"
        })
    }
    try{
        //xac minh token va trichs xuat cai userId for check
        const decoded = jwt.verify(token,process.env.JWT_SECRET)

        const user = await prisma.user.findUnique({
            where: {id: decoded.id},
        })
        if(!user){
        return res.status(401).json({
            error:"user no longer exists"
        })}
        req.user = user;
        next();
    }catch(error){
         return res.status(401).json({
            error:"not authorized, token failed"
        })
    }
}
export {authMiddleware}