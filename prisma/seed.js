import { prisma } from "../src/config/db.js";

// Mảng 20 phim thuần túy (không phụ thuộc vào bất kỳ biến bên ngoài nào)
const rawMovies = [
  {
    title: "The Shawshank Redemption",
    overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    releaseYear: 1994,
    genres: ["Drama"],
    runtime: 142,
    posterUrl: "https://image.tmdb.org/t/p/w500/9cqN02Y1b5x18K89y545jBsh.jpg",
  },
  {
    title: "The Godfather",
    overview: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
    releaseYear: 1972,
    genres: ["Crime", "Drama"],
    runtime: 175,
    posterUrl: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
  },
  {
    title: "The Dark Knight",
    overview: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests.",
    releaseYear: 2008,
    genres: ["Action", "Crime", "Drama"],
    runtime: 152,
    posterUrl: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  },
  {
    title: "Pulp Fiction",
    overview: "The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.",
    releaseYear: 1994,
    genres: ["Crime", "Drama"],
    runtime: 154,
    posterUrl: "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
  },
  {
    title: "Fight Club",
    overview: "An insomniac office worker and a devil-may-care soapmaker form an underground fight club that evolves into much more.",
    releaseYear: 1999,
    genres: ["Drama"],
    runtime: 139,
    posterUrl: "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
  },
  {
    title: "Forrest Gump",
    overview: "The history of the United States from the 1950s to the '70s unfolds from the perspective of an Alabama man with an IQ of 75.",
    releaseYear: 1994,
    genres: ["Drama", "Romance"],
    runtime: 142,
    posterUrl: "https://image.tmdb.org/t/p/w500/arw2VCBveWOVZr6pxd9XTd1TdQa.jpg",
  },
  {
    title: "Inception",
    overview: "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea.",
    releaseYear: 2010,
    genres: ["Action", "Sci-Fi"],
    runtime: 148,
    posterUrl: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
  },
  {
    title: "The Matrix",
    overview: "When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is an elaborate deception.",
    releaseYear: 1999,
    genres: ["Action", "Sci-Fi"],
    runtime: 136,
    posterUrl: "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
  },
  {
    title: "Interstellar",
    overview: "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft along with a team of researchers.",
    releaseYear: 2014,
    genres: ["Adventure", "Drama", "Sci-Fi"],
    runtime: 169,
    posterUrl: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
  },
  {
    title: "Spirited Away",
    overview: "During her family's move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits.",
    releaseYear: 2001,
    genres: ["Animation", "Adventure", "Fantasy"],
    runtime: 125,
    posterUrl: "https://image.tmdb.org/t/p/w500/393D224n0FjXmgVzox0z5iioz8n.jpg",
  },
  {
    title: "Parasite",
    overview: "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
    releaseYear: 2019,
    genres: ["Drama", "Thriller"],
    runtime: 132,
    posterUrl: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
  },
  {
    title: "Gladiator",
    overview: "A former Roman General sets out to exact vengeance against the corrupt emperor who murdered his family and sent him into slavery.",
    releaseYear: 2000,
    genres: ["Action", "Adventure", "Drama"],
    runtime: 155,
    posterUrl: "https://image.tmdb.org/t/p/w500/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg",
  },
  {
    title: "Titanic",
    overview: "A seventeen-year-old aristocrat falls in love with a kind but poor artist aboard the luxurious, ill-fated R.M.S. Titanic.",
    releaseYear: 1997,
    genres: ["Drama", "Romance"],
    runtime: 194,
    posterUrl: "https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg",
  },
  {
    title: "Avengers: Endgame",
    overview: "After the devastating events of Infinity War, the universe is in ruins. With the help of remaining allies, the Avengers assemble once more.",
    releaseYear: 2019,
    genres: ["Action", "Adventure", "Sci-Fi"],
    runtime: 181,
    posterUrl: "https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
  },
  {
    title: "Whiplash",
    overview: "A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing.",
    releaseYear: 2014,
    genres: ["Drama", "Music"],
    runtime: 106,
    posterUrl: "https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg",
  },
  {
    title: "The Prestige",
    overview: "After a tragic accident, two stage magicians in 1890s London engage in a battle to create the ultimate illusion while sacrificing everything they have.",
    releaseYear: 2006,
    genres: ["Drama", "Mystery", "Sci-Fi"],
    runtime: 130,
    posterUrl: "https://image.tmdb.org/t/p/w500/bdN3gXu4H7rOMV3a9p6m9uFjT.jpg",
  },
  {
    title: "Coco",
    overview: "Aspiring musician Miguel, confronted with his family's ancestral ban on music, enters the Land of the Dead to find his great-great-grandfather.",
    releaseYear: 2017,
    genres: ["Animation", "Family", "Fantasy"],
    runtime: 105,
    posterUrl: "https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg",
  },
  {
    title: "Spider-Man: Into the Spider-Verse",
    overview: "Teen Miles Morales becomes the new Spider-Man and joins other Spider-Heroes from parallel dimensions to stop a threat to all reality.",
    releaseYear: 2018,
    genres: ["Animation", "Action", "Adventure"],
    runtime: 117,
    posterUrl: "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
  },
  {
    title: "Joker",
    overview: "During the 1980s, a failed stand-up comedian is driven insane and turns to a life of crime and chaos in Gotham City while becoming an infamous figure.",
    releaseYear: 2019,
    genres: ["Crime", "Thriller", "Drama"],
    runtime: 122,
    posterUrl: "https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
  },
  {
    title: "Oppenheimer",
    overview: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.",
    releaseYear: 2023,
    genres: ["Biography", "Drama", "History"],
    runtime: 180,
    posterUrl: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
  },
];

async function main() {
  console.log(" Bắt đầu seed Movie và Watchlist...");

  // 1. Tìm user a@gmail.com trong Database
  const user = await prisma.user.findFirst({
    where: { email: "a@gmail.com" },
  });

  if (!user) {
    console.error(" Không tìm thấy user a@gmail.com trong database!");
    return;
  }

  // 2. Tự động gắn createdBy của từng bộ phim bằng id của user vừa tìm thấy
  const moviesWithUserId = rawMovies.map((movie) => ({
    ...movie,
    createdBy: user.id,
  }));

  // 3. Xóa dữ liệu phim/watchlist cũ để tránh trùng lặp
  await prisma.watchlistItem.deleteMany();
  await prisma.movie.deleteMany();

  // 4. Lưu 20 phim vào Database
  console.log("Đang thêm 20 phim...");
  const createdMovies = await prisma.movie.createManyAndReturn({
    data: moviesWithUserId,
  });

  // 5. Thêm 3 phim mẫu vào Watchlist
  console.log("📋 Đang thêm phim mẫu vào Watchlist...");
  await prisma.watchlistItem.createMany({
    data: [
      {
        userId: user.id,
        movieId: createdMovies[0].id,
        status: "COMPLETED",
        rating: 10,
        notes: "Phim xem cực kỳ xúc động!",
      },
      {
        userId: user.id,
        movieId: createdMovies[1].id,
        status: "WATCHING",
        rating: 9,
        notes: "Đang xem lại cùng gia đình.",
      },
      {
        userId: user.id,
        movieId: createdMovies[2].id,
        status: "PLANNED",
        rating: null,
        notes: "Để dành cuối tuần rảnh rỗi xem.",
      },
    ],
  });

  console.log(`Thành công! Đã seed 20 phim và 3 watchlist items cho user: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(" Lỗi khi seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });