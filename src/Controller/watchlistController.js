import { prisma } from "../config/db.js";
import {addtoWatchlist} from "../services/watchlistService.js"
const addTo = async(req,res)=>{
   try{
    const watchlistItem = await addtoWatchlist(
        req.user.id,
        req.body
    )
    res.status(201).json({
        status: "Success",
        data:{
            watchlistItem,
        }
    })
}catch(error){
    

    res.status(error.status||500).json({
         error: error.statusCode
                ? error.message
                : "Internal server error",
    })
}
}
export {addTo};