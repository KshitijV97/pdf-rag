// backend/src/server.ts
import express from "express";
import multer from "multer";
import cors from "cors";
import { ChromaClient, OpenAIEmbeddingFunction } from "chromadb";
import { PdfReader } from "pdfreader";
import { v4 as uuidv4 } from "uuid";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
  AIMessagePromptTemplate,
} from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { Ollama } from "@langchain/community/llms/ollama";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { formatDocumentsAsString } from "langchain/util/document";

const app = express();
const upload = multer({ dest: "uploads/" });
const chroma = new ChromaClient();

app.use(cors());
app.use(express.json());

const COLLECTION_NAME = "pdf_documents";
let collection;

// Initialize ChromaDB collection
async function initializeCollection() {
  try {
    collection = await chroma.getOrCreateCollection({
      name: COLLECTION_NAME,
    });
  } catch (error) {
    console.error("Error initializing ChromaDB:", error);
  }
}

initializeCollection();

// Function to extract text from PDF
async function extractTextFromPDF(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    new PdfReader().parseFileItems(filePath, (err: any, item: any) => {
      if (err) reject(err);
      if (!item) {
        resolve(text);
      } else if (item.text) {
        text += item.text + " ";
      }
    });
  });
}

// Function to chunk text
function chunkText(text: string, chunkSize: number = 1000): string[] {
  const words = text.split(" ");
  const chunks = [];
  let currentChunk = "";

  for (const word of words) {
    if (currentChunk.length + word.length > chunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    currentChunk += word + " ";
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

// Setup LangChain prompt template
const SYSTEM_TEMPLATE = `You are a helpful AI assistant that answers questions based on provided context. 
Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
Always answer in a comprehensive but concise way.

----------------
{context}
----------------`;

const HUMAN_TEMPLATE = "{question}";

const AI_TEMPLATE =
  "I'll help answer your question based on the context provided.";

const chatPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(SYSTEM_TEMPLATE),
  HumanMessagePromptTemplate.fromTemplate(HUMAN_TEMPLATE),
  AIMessagePromptTemplate.fromTemplate(AI_TEMPLATE),
]);

// Setup Ollama model
const model = new Ollama({
  baseUrl: "http://localhost:11434",
  model: "deepseek-coder:6.7b",
});

// Create QA Chain
const qaChain = RunnableSequence.from([
  {
    context: async (input: { question: string; context: Document[] }) =>
      formatDocumentsAsString(input.context),
    question: (input: { question: string; context: Document[] }) =>
      input.question,
  },
  chatPrompt,
  model,
  new StringOutputParser(),
]);

app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const text = await extractTextFromPDF(req.file.path);
    const chunks = chunkText(text);

    // Store chunks in ChromaDB
    const ids = chunks.map(() => uuidv4());
    await collection.add({
      ids,
      documents: chunks,
    });

    res.json({ message: "File processed successfully" });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Error processing file" });
  }
});

app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    // Retrieve relevant chunks from ChromaDB
    const results = await collection.query({
      queryTexts: [question],
      nResults: 3,
    });

    const relevantChunks = results.documents[0];

    // Convert chunks to LangChain Documents
    const documents = relevantChunks.map(
      (chunk) => new Document({ pageContent: chunk })
    );

    // Get response using LangChain QA Chain
    const response = await qaChain.invoke({
      question,
      context: documents,
    });

    // Calculate simple confidence score based on retrieved chunks relevance
    const confidence = Math.min(
      results.distances?.[0].reduce((acc, dist) => acc + (1 - dist), 0) / 3,
      1
    );

    res.json({
      answer: response,
      confidence,
      relevantChunks,
    });
  } catch (error) {
    console.error("Error processing question:", error);
    res.status(500).json({ error: "Error processing question" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
