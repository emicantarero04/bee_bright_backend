require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require("nodemailer");
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');

const app = express();
const port = process.env.PORT || 3000;

// ✅ Configurar CORS para permitir cookies
app.use(cors({
  origin: ['https://beebright.netlify.app'], // Cambia por tu dominio de Netlify
  credentials: true
}));

app.use(bodyParser.json());
app.use(cookieParser());

// ✅ Configurar Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,  // Gmail
    pass: process.env.EMAIL_PASS   // Contraseña de aplicación
  }
});

// ✅ Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

const upload = multer({ dest: 'uploads/' });

// ✅ Conexión a MongoDB
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db;

(async () => {
  try {
    await client.connect();
    db = client.db('BeeBright');
    console.log('✅ Conectado a MongoDB Atlas');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err);
  }
})();

// ✅ Middleware para validar token
function verifyAdmin(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(403).json({ message: "No autorizado" });

  try {
    jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    next();
  } catch {
    res.status(403).json({ message: "Token inválido" });
  }
}

// ✅ Usuario admin (usa variables de entorno en Render)
const ADMIN_USER = {
  username: process.env.ADMIN_USER || "admin",
  passwordHash: bcrypt.hashSync(process.env.ADMIN_PASS || "123456", 10)
};

// ✅ Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USER.username || !bcrypt.compareSync(password, ADMIN_USER.passwordHash)) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET || "secretkey", { expiresIn: '2h' });

  res.cookie("token", token, {
    httpOnly: true,
    secure: true, // ✅ Obligatorio en producción (HTTPS)
    sameSite: 'None' // ✅ Necesario para cross-site cookies
  });

  res.json({ message: "Login exitoso" });
});

// ✅ Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  });
  res.json({ message: "Sesión cerrada" });
});

// ✅ Proteger admin.html y admin
app.get(['/admin', '/admin.html'], (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login.html');

  try {
    jwt.verify(token, process.env.JWT_SECRET || "secretkey");
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } catch {
    return res.redirect('/login.html');
  }
});

// ✅ API: Subir imagen (protegido)
app.post('/api/upload-image', verifyAdmin, upload.single('imagen'), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path);
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al subir imagen');
  }
});

// ✅ API: Guardar contenido (protegido)
app.post('/api/update-section', verifyAdmin, async (req, res) => {
  try {
    const data = req.body;
    const collection = db.collection('contenido');
    await collection.updateOne(
      { id: 'site-content' },
      { $set: data },
      { upsert: true }
    );
    res.send('Contenido actualizado');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al guardar contenido');
  }
});

// ✅ API: Obtener contenido
app.get('/api/get-content', async (req, res) => {
  try {
    const collection = db.collection('contenido');
    const data = await collection.findOne({ id: 'site-content' });
    res.json(data || {});
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener contenido');
  }
});

// ✅ API: Formulario de contacto
app.post("/enviarCorreo", (req, res) => {
  const { gname, gmail, cname, cage, message } = req.body;
  const isValidString = (value) => typeof value === "string" && value.trim() !== "";

  if (!isValidString(gname) || !isValidString(gmail) || !isValidString(message)) {
    return res.status(400).send("Por favor, completa todos los campos obligatorios.");
  }

  const mailOptions = {
    from: gmail,
    to: process.env.EMAIL_TO,
    subject: `Consulta de ${gname} - Bee Bright`,
    text: `Nombre: ${gname}\nCorreo: ${gmail}\nNombre del niño: ${cname}\nEdad: ${cage}\n\nMensaje:\n${message}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      return res.status(500).send("Error al enviar el correo");
    }
    console.log("Correo enviado: " + info.response);
    res.status(200).send("Correo enviado exitosamente");
  });
});

// ✅ Servir archivos estáticos
app.use(express.static('public'));

// ✅ Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend en: http://localhost:${port}`);
});
