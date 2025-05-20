import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';

import { OpenAPIParser } from '../core/parser';
import { Judge } from '../core/score-engine';

const app = express();
const port = process.env.PORT || 3000;

// Set up disk storage for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

app.post('/api/analyze', upload.single('spec'), async (req, res) => {
  try {
    let fileAddress;

    if (req.file) {
      // Read the file from disk
      // fileAddress = await fs.readFile(req.file.path, 'utf8');
      fileAddress = req.file.path
      // await fs.unlink(req.file.path);
    } else if (req.body.url) {
      fileAddress = req.body.url;
    } else if (req.body.content) {
      fileAddress = req.body.content;
    } else {
      return res.status(400).json({ error: 'No specification provided' });
    }
    console.log("file address is: ", fileAddress);

    const parser = new OpenAPIParser();
    const apiSpec = await parser.parse(fileAddress);

    const judge = new Judge();
    const report = judge.evaluate(apiSpec);

    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'An unknown error occurred during analysis' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

