const youtubedl = require("youtube-dl-exec");
console.log("Iniciando teste...");
youtubedl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
	dumpSingleJson: true,
})
	.then((info) => console.log("Sucesso:", info.url))
	.catch((err) => console.error("Erro:", err));
