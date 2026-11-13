import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

interface RawWord {
  text?: string;
  startTime?: number;
  endTime?: number;
}

interface RawLine {
  startTime?: number;
  endTime?: number;
  words?: RawWord[];
  text?: string;
}

interface GeminiAnalysisPayload {
  suggestedTitle?: string;
  suggestedArtist?: string;
  lines?: RawLine[];
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeAnalyzedLines(rawLines: RawLine[], durationSec: number) {
  const maxDur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 600;
  const cleaned: Array<{
    id: string;
    startTime: number;
    endTime: number;
    words: Array<{ id: string; text: string; startTime: number; endTime: number }>;
  }> = [];

  let prevEnd = 0;

  rawLines.forEach((rawLine, lineIdx) => {
    const rawWords: RawWord[] =
      Array.isArray(rawLine.words) && rawLine.words.length > 0
        ? rawLine.words
        : typeof rawLine.text === 'string' && rawLine.text.trim().length > 0
          ? rawLine.text.trim().split(/\s+/).map((w): RawWord => ({ text: w }))
          : [];

    if (rawWords.length === 0) return;

    let lineStart = typeof rawLine.startTime === 'number' && Number.isFinite(rawLine.startTime)
      ? Math.max(0, Math.min(maxDur - 0.1, rawLine.startTime))
      : prevEnd;
    if (lineStart < prevEnd) {
      lineStart = Math.min(maxDur - 0.1, prevEnd);
    }

    let lineEnd = typeof rawLine.endTime === 'number' && Number.isFinite(rawLine.endTime)
      ? Math.max(lineStart + 0.25, Math.min(maxDur, rawLine.endTime))
      : Math.min(maxDur, lineStart + Math.max(1.2, rawWords.length * 0.45));

    const wordCount = rawWords.length;
    const span = Math.max(0.25, lineEnd - lineStart);
    const words: Array<{ id: string; text: string; startTime: number; endTime: number }> = [];

    let cursor = lineStart;
    const totalChars = rawWords.reduce((acc, w) => acc + Math.max(1, (w.text ?? '').trim().length), 0);

    rawWords.forEach((rw, wIdx) => {
      const token = (rw.text ?? '').trim();
      if (!token) return;

      const fallbackDur = (Math.max(1, token.length) / Math.max(1, totalChars)) * span;
      let wStart = typeof rw.startTime === 'number' && Number.isFinite(rw.startTime)
        ? Math.max(lineStart, Math.min(lineEnd - 0.05, rw.startTime))
        : cursor;
      if (wStart < cursor) wStart = cursor;

      let wEnd = typeof rw.endTime === 'number' && Number.isFinite(rw.endTime)
        ? Math.max(wStart + 0.06, Math.min(lineEnd, rw.endTime))
        : Math.min(lineEnd, wStart + fallbackDur);

      if (wIdx === wordCount - 1 && wEnd < lineEnd && wEnd - wStart < 0.08) {
        wEnd = lineEnd;
      }

      words.push({
        id: `w-${lineIdx}-${wIdx}-${Math.round(wStart * 100)}`,
        text: token,
        startTime: Number(wStart.toFixed(2)),
        endTime: Number(Math.max(wStart + 0.06, wEnd).toFixed(2)),
      });
      cursor = Math.max(cursor, wEnd);
    });

    if (words.length === 0) return;

    lineStart = words[0].startTime;
    lineEnd = Math.max(lineEnd, words[words.length - 1].endTime);
    prevEnd = lineEnd;

    cleaned.push({
      id: `line-${lineIdx}-${Math.round(lineStart * 100)}`,
      startTime: Number(lineStart.toFixed(2)),
      endTime: Number(lineEnd.toFixed(2)),
      words,
    });
  });

  return cleaned;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/lyrics/analyze', async (req, res) => {
    try {
      const { audioBase64, mimeType, lyricsText, durationSec, fileName } = req.body ?? {};

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Audio mancante nella richiesta.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'Chiave API Gemini non configurata sul server. Puoi comunque usare la sincronizzazione automatica distribuita o il brano demo.',
          code: 'NO_API_KEY',
        });
        return;
      }

      const safeDuration = typeof durationSec === 'number' && durationSec > 0 ? durationSec : 180;
      const hasLyrics = typeof lyricsText === 'string' && lyricsText.trim().length > 0;

      const prompt = hasLyrics
        ? [
            `Ascolta con attenzione questa traccia musicale (durata totale: ${safeDuration.toFixed(2)} secondi, file: "${fileName || 'brano'}").`,
            `L'utente ha fornito il testo esatto della canzone qui sotto.`,
            `Il tuo compito è allineare OGNI RIGA e OGNI SINGOLA PAROLA del testo fornito ai secondi esatti (da 0.0 a ${safeDuration.toFixed(2)}) in cui vengono cantate nella melodia.`,
            `Regole fondamentali:`,
            `- Mantieni esattamente le parole e le righe del testo fornito (puoi dividere righe troppo lunghe in frasi naturali cantabili, ma non inventare parole nuove).`,
            `- Ogni parola deve avere startTime e endTime accurati al decimo/centesimo di secondo in ordine crescente.`,
            `- Non superare mai ${safeDuration.toFixed(2)} secondi.`,
            `- Se riconosci chiaramente titolo o artista, suggeriscili, altrimenti lascia stringa vuota.`,
            `\nTESTO FORNITO:\n${lyricsText.trim()}`,
          ].join('\n')
        : [
            `Ascolta con attenzione questa traccia musicale (durata totale: ${safeDuration.toFixed(2)} secondi, file: "${fileName || 'brano'}").`,
            `L'utente NON ha fornito il testo. Trascrivi con precisione tutto il testo cantato nella canzone nella lingua originale, suddiviso in righe karaoke naturali (massimo 7-8 parole per riga).`,
            `Per ogni riga e per OGNI SINGOLA PAROLA, indica i timestamp esatti in secondi (startTime e endTime, da 0.0 a ${safeDuration.toFixed(2)}) in cui la parola inizia e finisce di essere cantata.`,
            `Regole fondamentali:`,
            `- Ignora le parti puramente strumentali (non inventare parole durante gli assoli o le intro senza voce).`,
            `- Ogni parola deve avere startTime < endTime, in ordine strettamente crescente.`,
            `- Se la traccia è puramente strumentale senza voce, restituisci un array lines vuoto.`,
            `- Se riconosci titolo o artista, suggeriscili, altrimenti lascia stringa vuota.`,
          ].join('\n');

      const audioPart = {
        inlineData: {
          mimeType: typeof mimeType === 'string' && mimeType.startsWith('audio/') ? mimeType : 'audio/wav',
          data: audioBase64,
        },
      };

      const callGemini = async () => {
        return ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts: [audioPart, { text: prompt }] },
          config: {
            systemInstruction:
              'Sei un ingegnere audio specializzato in sincronizzazione karaoke word-by-word. Restituisci esclusivamente JSON valido conforme allo schema.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suggestedTitle: {
                  type: Type.STRING,
                  description: 'Titolo rilevato se noto, altrimenti stringa vuota.',
                },
                suggestedArtist: {
                  type: Type.STRING,
                  description: 'Artista rilevato se noto, altrimenti stringa vuota.',
                },
                lines: {
                  type: Type.ARRAY,
                  description: 'Elenco cronologico delle righe karaoke.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      startTime: { type: Type.NUMBER },
                      endTime: { type: Type.NUMBER },
                      words: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            text: { type: Type.STRING },
                            startTime: { type: Type.NUMBER },
                            endTime: { type: Type.NUMBER },
                          },
                          required: ['text', 'startTime', 'endTime'],
                        },
                      },
                    },
                    required: ['startTime', 'endTime', 'words'],
                  },
                },
              },
              required: ['lines'],
            },
          },
        });
      };

      let response;
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await callGemini();
          break;
        } catch (err) {
          lastError = err;
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
        }
      }

      if (!response) {
        throw lastError ?? new Error('Impossibile contattare il servizio di trascrizione.');
      }

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson) as GeminiAnalysisPayload;
      const lines = sanitizeAnalyzedLines(Array.isArray(parsed.lines) ? parsed.lines : [], safeDuration);

      res.json({
        suggestedTitle: typeof parsed.suggestedTitle === 'string' ? parsed.suggestedTitle.trim() : '',
        suggestedArtist: typeof parsed.suggestedArtist === 'string' ? parsed.suggestedArtist.trim() : '',
        lines,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore durante l\'analisi audio.';
      console.error('[lyrics/analyze] error:', message);
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Palco Studio server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
