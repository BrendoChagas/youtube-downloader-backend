const express = require("express");
const youtubedl = require("youtube-dl-exec");
const cors = require("cors");
const fs = require("fs").promises;
const fsSync = require("fs"); // Para operações síncronas
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const app = express();
const port = 3000;

console.log("Iniciando servidor...");
console.log("youtube-dl-exec importado:", !!youtubedl);

// Promisify exec para usar async/await
const execPromise = util.promisify(exec);

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	next();
});

// Configuração para arquivos temporários
const tempDir = path.join(__dirname, "temp");
(async () => {
	try {
		await fs.access(tempDir);
	} catch {
		await fs.mkdir(tempDir);
	}
})();

// Rota para servir o arquivo mesclado
app.get("/temp/:filename", async (req, res) => {
	const filePath = path.join(tempDir, req.params.filename);
	try {
		if (
			await fs
				.access(filePath)
				.then(() => true)
				.catch(() => false)
		) {
			res.download(filePath, "video.mp4", (err) => {
				if (err) {
					console.error("Erro ao servir arquivo:", err);
					res.status(500).send("Erro ao baixar o arquivo");
				}
				// Limpa o arquivo após o download
				fs.unlink(filePath).catch((err) =>
					console.error("Erro ao deletar arquivo:", err)
				);
			});
		} else {
			res.status(404).send("Arquivo não encontrado");
		}
	} catch (err) {
		console.error("Erro na rota /temp:", err);
		res.status(500).send("Erro ao processar o arquivo");
	}
});

app.get("/download", async (req, res) => {
	try {
		console.log("Recebida requisição para:", req.query.url);
		const videoUrl = req.query.url;
		if (!videoUrl) {
			return res.status(400).json({ error: "URL do vídeo é obrigatória" });
		}

		// Obtém metadados para selecionar formato
		const info = await youtubedl(videoUrl, {
			dumpSingleJson: true,
			noWarnings: true,
			format:
				"bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][acodec!=none][ext=mp4]/18",
		});

		console.log("Formato selecionado nos metadados:", {
			format_id: info.format_id,
			resolution: info.resolution,
			ext: info.ext,
		});

		if (!info.format_id) {
			return res
				.status(404)
				.json({ error: "Nenhum formato de vídeo encontrado" });
		}

		// Baixa vídeo e áudio em arquivos temporários
		const videoFile = path.join(tempDir, "video_temp.mp4");
		const audioFile = path.join(tempDir, "audio_temp.m4a");
		const mergedFile = path.join(tempDir, `video_merged_${Date.now()}.mp4`);

		// Baixa vídeo e áudio separadamente
		if (info.format_id.includes("+")) {
			const [videoFormat, audioFormat] = info.format_id.split("+");
			await youtubedl(videoUrl, {
				format: videoFormat,
				output: videoFile,
				noWarnings: true,
			});
			await youtubedl(videoUrl, {
				format: audioFormat,
				output: audioFile,
				noWarnings: true,
			});

			// Verifica se os arquivos foram criados
			if (
				!(await fs
					.access(videoFile)
					.then(() => true)
					.catch(() => false)) ||
				!(await fs
					.access(audioFile)
					.then(() => true)
					.catch(() => false))
			) {
				throw new Error("Falha ao baixar vídeo ou áudio temporário");
			}
		} else {
			// Formato único (ex.: 18)
			await youtubedl(videoUrl, {
				format: info.format_id,
				output: mergedFile,
				noWarnings: true,
			});
		}

		// Mescla com FFmpeg se necessário
		if (info.format_id.includes("+")) {
			const ffmpegCmd = `ffmpeg -i "${videoFile}" -i "${audioFile}" -c copy -movflags +faststart "${mergedFile}" -y`;
			console.log("Executando FFmpeg:", ffmpegCmd);
			await execPromise(ffmpegCmd);

			// Limpa arquivos temporários de vídeo e áudio
			await fs
				.unlink(videoFile)
				.catch(() => console.log("Arquivo de vídeo temporário já deletado"));
			await fs
				.unlink(audioFile)
				.catch(() => console.log("Arquivo de áudio and temporary já deletado"));
		}

		// Retorna URL para o arquivo mesclado
		const filename = path.basename(mergedFile);
		const serveUrl = `http://localhost:${port}/temp/${filename}`;
		res.json({ videoUrl: serveUrl });

		// Limpa arquivo mesclado após 5 minutos
		setTimeout(async () => {
			await fs
				.unlink(mergedFile)
				.catch(() => console.log("Arquivo mesclado já deletado"));
		}, 300000);
	} catch (error) {
		console.error("Erro na rota /download:", error.message, error.stack);
		res
			.status(500)
			.json({ error: `Erro ao processar o vídeo: ${error.message}` });
	}
});

app.listen(port, () => {
	console.log(`Servidor rodando em http://localhost:${port}`);
});

process.on("uncaughtException", (error) => {
	console.error("Erro não tratado:", error.message, error.stack);
});

process.on("unhandledRejection", (reason, promise) => {
	console.error("Rejeição não tratada:", reason);
});

setInterval(() => {
	console.log("Servidor ainda rodando:", new Date().toLocaleTimeString());
}, 30000);
