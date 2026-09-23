import {prisma} from '../config/db.js'
const findMoviebyId = async(movieId)=>{
    return await prisma.movie.findUnique({
        where: {
            id: movieId
        }
    })
}
const findwatchlistItem = async(User_id, movieId)=>{
    return await prisma.watchlistItem.findUnique({
        where: {
            userId_movieId:
            {
                userId: User_id,
            movieId: movieId
        }
        }
    })
}
const CreatewatchlistItem = async(data)=>{
    return await prisma.watchlistItem.create({
        data
    })
}
export {
    CreatewatchlistItem,findMoviebyId,findwatchlistItem
}