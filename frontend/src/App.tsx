import React, { useState } from "react";
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

interface Answer {
  answer: string;
  confidence: number;
  relevantChunks: string[];
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setLoading(true);
      setUploadStatus("Uploading...");

      const formData = new FormData();
      formData.append("pdf", selectedFile);

      try {
        const response = await fetch("http://localhost:3000/upload", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          setUploadStatus("File uploaded and processed successfully!");
        } else {
          setUploadStatus("Error uploading file");
        }
      } catch (error) {
        setUploadStatus("Error uploading file");
        console.error("Error:", error);
      }
      setLoading(false);
    }
  };

  const handleQuestionSubmit = async () => {
    if (!question) return;

    setLoading(true);
    try {
      const response = await fetch("http://localhost:3000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();
      setAnswer(data);
    } catch (error) {
      console.error("Error:", error);
    }
    setLoading(false);
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          PDF Q&A with RAG
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Button
            variant="contained"
            component="label"
            startIcon={<CloudUploadIcon />}
            sx={{ mb: 2 }}
          >
            Upload PDF
            <input
              type="file"
              hidden
              accept=".pdf"
              onChange={handleFileUpload}
            />
          </Button>
          {uploadStatus && (
            <Alert
              severity={uploadStatus.includes("Error") ? "error" : "success"}
            >
              {uploadStatus}
            </Alert>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <TextField
            fullWidth
            label="Ask a question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleQuestionSubmit}
            disabled={loading || !file}
            sx={{ mb: 2 }}
          >
            Ask Question
          </Button>

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", my: 2 }}>
              <CircularProgress />
            </Box>
          )}

          {answer && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6">Answer:</Typography>
              <Typography paragraph>{answer.answer}</Typography>

              <Typography variant="subtitle1" color="text.secondary">
                Confidence: {(answer.confidence * 100).toFixed(1)}%
              </Typography>

              <Typography variant="h6">Relevant Passages:</Typography>
              {answer.relevantChunks.map((chunk, index) => (
                <Paper key={index} sx={{ p: 2, my: 1, bgcolor: "grey.100" }}>
                  <Typography>{chunk}</Typography>
                </Paper>
              ))}
            </Box>
          )}
        </Paper>
      </Box>
    </Container>
  );
}

export default App;
