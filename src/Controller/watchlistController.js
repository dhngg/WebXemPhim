import { prisma } from "../config/db.js";
const addTo = async(req,res)=>{
    const {movieId,status,rating,notes} = req.body;
    const userId = req.user?.id ;
    const movie = await prisma.movie.findUnique({
        where: {id: movieId},
    });
    if(!movie){
        return res.status(404).json({error:"movie not found"})
    }

//check if already added
    const movie_added = await prisma.watchlistItem.findUnique({
        where: {userId_movieId:{
            userId: userId,
            movieId: movieId,
        }},
    });
    if(movie_added){
        return res.status(400).json({error:"movie already exists"})
    }

    const watchlistItem = await prisma.watchlistItem.create({
        data: {
            userId,
            movieId,
            status: status || "PLANNED",
            rating,
            notes,
        }
    });
    res.status(201).json({
        status: "Success",
        data:{
            watchlistItem,
        }
    })
}
export {addTo};