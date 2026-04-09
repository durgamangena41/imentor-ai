import axios from 'axios';

const summarizerClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:2000/api',
});

summarizerClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function summarizeText(payload) {
  const response = await summarizerClient.post('/summarizer/text', payload);
  return response.data;
}

export async function summarizeFile(file, payload) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', payload.format);
  formData.append('length', payload.length);

  const response = await summarizerClient.post('/summarizer/file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
}

export async function summarizeUrl(payload) {
  const response = await summarizerClient.post('/summarizer/url', payload);
  return response.data;
}

export async function saveNote(payload) {
  const response = await summarizerClient.post('/notes', payload);
  return response.data;
}