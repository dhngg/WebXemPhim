import {CreatewatchlistItem,findMoviebyId,findwatchlistItem} from '../repositories/watchlistRepository.js'
import {authMiddleware} from '../middleware/auMiddleware.js'
const addtoWatchlist = async(userId,data) =>{
    const {movieId,status,rating,notes} = data;
    const movie = await findMoviebyId(movieId);
    if(!movie) {
        const error = new Error("movie not found");
    error.statusCode = 404;
    throw error
    }
    const movie_add = await findwatchlistItem(userId,movieId);
    if(movie_add){
        const error = new Error("movie already add");
    error.statusCode = 404;
    throw error
    }
    return CreatewatchlistItem({
        userId: userId,
        movieId,
        status,
        rating,
        notes
        //khi ten thuoc tinh trung voi ten gia tri thi dc viet gon
    })
}
export {addtoWatchlist};