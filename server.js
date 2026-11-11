import express from "express";
import cors from "cors";
import multer from "multer";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ☁️ Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// ⚙️ Multer setup (for handling file upload)
const upload = multer({ storage: multer.memoryStorage() });

// 📨 Email configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 📧 Email route

app.post("/send-mail", (req, res) => {

  upload.single("file")(req, res, async (uploadError) => {

    try {
      // Handle file upload errors
      if (uploadError) {
        console.error("MULTER ERROR:", uploadError);

        return res.status(400).json({
          success: false,
          message: uploadError.message
        });
      }

      console.log("📩 SEND MAIL API CALLED");
      console.log("Content Type:", req.headers["content-type"]);
      console.log("Request Body:", req.body);
      console.log("File Received:", Boolean(req.file));

      // Validate request body
      const body = req.body || {};

      const {
        studentName,
        regNumber,
        course,
        batch,
        applicantName,
        email,
        phone,
        message
      } = body;

      if (
        !studentName ||
        !regNumber ||
        !course ||
        !batch ||
        !applicantName ||
        !email ||
        !phone ||
        !message
      ) {
        return res.status(400).json({
          success: false,
          message: "Please provide all required certificate verification details.",
          receivedFields: Object.keys(body)
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please attach a PDF or ZIP certificate file."
        });
      }

      // Upload certificate to Cloudinary
      console.log("Uploading certificate to Cloudinary...");

      const uploadPromise = new Promise((resolve, reject) => {

        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "student_certificates",
            resource_type: "raw"
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );

        streamifier
          .createReadStream(req.file.buffer)
          .pipe(uploadStream);

      });

      const cloudinaryResult = await uploadPromise;

      const fileUrl = cloudinaryResult.secure_url;

      console.log("✅ Cloudinary upload successful:", fileUrl);

      // Prevent HTML injection in email content
      const escapeHtml = (value) =>
        String(value ?? "").replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[char]);

      const s = {
        studentName: escapeHtml(studentName),
        regNumber: escapeHtml(regNumber),
        course: escapeHtml(course),
        batch: escapeHtml(batch),
        applicantName: escapeHtml(applicantName),
        email: escapeHtml(email),
        phone: escapeHtml(phone),
        message: escapeHtml(message)
      };

      // Admin email
      const adminMailOptions = {
        from: `"Student Certificate Verification" <${process.env.EMAIL_USER}>`,
        to: "eduverify@vishwavishwani.ac.in",
        subject: `Student Certificate Verification from ${applicantName}`,

        html: `
          <p>Hello Vishwa Vishwani Team,</p>

          <p>
            Please check the Student Certificate Verification
            details submitted by <b>${s.applicantName}</b>.
          </p>

          <table border="1" cellspacing="0" cellpadding="8">
            <tr><th>Student Name</th><td>${s.studentName}</td></tr>
            <tr><th>Registration Number</th><td>${s.regNumber}</td></tr>
            <tr><th>Course</th><td>${s.course}</td></tr>
            <tr><th>Batch</th><td>${s.batch}</td></tr>
            <tr><th>Applicant Name</th><td>${s.applicantName}</td></tr>
            <tr><th>Email</th><td>${s.email}</td></tr>
            <tr><th>Phone</th><td>${s.phone}</td></tr>
            <tr><th>Message</th><td>${s.message}</td></tr>
            <tr>
              <th>Attachment</th>
              <td>
                <a href="${fileUrl}" target="_blank">
                  View Certificate
                </a>
              </td>
            </tr>
          </table>

          <br/>
          <p>Best regards,</p>
          <b>Vishwa Vishwani Team</b>

          <br/><br/>
          <img
            src="https://www.vishwavishwani.ac.in/pgdm/images/vvism-logo.webp"
            width="180"
            alt="Vishwa Vishwani Logo"
          />
        `
      };

      await transporter.sendMail(adminMailOptions);

      console.log("✅ Admin email sent successfully");

      // Applicant confirmation email
      const applicantMailOptions = {
        from: `"Vishwa Vishwani Institute of Systems and Management" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Certificate Verification Request Received",

        html: `
          <p>Dear <b>${s.applicantName}</b>,</p>

          <p>
            Thank you for submitting your certificate verification
            request for <b>${s.studentName}</b>.
          </p>

          <p>
            We have received your details successfully.
            Our verification team will review your request
            and get back to you shortly.
          </p>

          <br/>
          <b>Submitted Details:</b>

          <ul>
            <li>Student Name: ${s.studentName}</li>
            <li>Registration Number: ${s.regNumber}</li>
            <li>Course: ${s.course}</li>
            <li>Batch: ${s.batch}</li>
          </ul>

          <p>
            Our team will respond within 2–3 working days.
          </p>

          <p>Thank you for reaching out to <b>Vishwa Vishwani</b>.</p>

          <p>
            Best regards,<br/>
            <b>Vishwa Vishwani Institute of Systems and Management</b>
          </p>

          <img
            src="https://www.vishwavishwani.ac.in/pgdm/images/vvism-logo.webp"
            width="160"
            alt="Vishwa Vishwani Logo"
          />
        `
      };

      await transporter.sendMail(applicantMailOptions);

      console.log("✅ Applicant email sent successfully:", email);

      return res.status(200).json({
        success: true,
        message: "Certificate verification request submitted successfully.",
        adminEmailSent: true,
        applicantEmailSent: true
      });

    } catch (error) {

      console.error("❌ SEND MAIL ERROR:", {
        message: error.message,
        code: error.code,
        response: error.response,
        responseCode: error.responseCode
      });

      return res.status(500).json({
        success: false,
        message: "Certificate verification submission failed.",
        error: error.message,
        code: error.code || "UNKNOWN"
      });

    }

  });

});


app.post("/send-brochure-link", async (req, res) => {
  try {
    const { name, email, mobile, reportType } = req.body;

    if (!name || !email || !mobile) {
      return res.status(400).json({ success: false });
    }

    // ✅ Map reports
    const reports = {
      "2024-26": "https://drive.google.com/uc?export=download&id=1IYt31686fGNozt71ndnHevlMvka-gBZ6",
      "2023-25": "https://drive.google.com/uc?export=download&id=1z41i-F0KOe8qORQKY03WK5lBFFtEw7ku"
    };

    const downloadLink = reports[reportType];

    if (!downloadLink) {
      return res.status(400).json({ success: false, message: "Invalid report type" });
    }

    // ✅ Create JWT with download link
    const token = jwt.sign(
      { email, name, mobile, downloadLink },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const verifyLink = `https://vishwavishwani.ac.in/pgdm/verify-brochure?token=${token}`;

    // 📧 USER EMAIL
    await transporter.sendMail({
      from: `"Vishwa Vishwani" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Download ${reportType} Placement Report`,
      html: `
        <h3>Hello ${name},</h3>
        <p>You requested <b>${reportType} Placement Report</b>.</p>
        <p>Click below to verify and download:</p>
        <a href="${verifyLink}" style="padding:10px 20px;background:#0d6efd;color:#fff;text-decoration:none;">
          Verify & Download
        </a>
        <p>This link expires in 10 minutes.</p>
      `,
    });

    // 📩 ADMIN EMAIL
    await transporter.sendMail({
      from: `"Brochure Enquiry" <${process.env.EMAIL_USER}>`,
      to: "website@vishwavishwani.ac.in",
      subject: "New Placement Report Request",
      html: `
        <h3>New Report Request</h3>
        <table border="1" cellpadding="8" cellspacing="0">
          <tr><th>Name</th><td>${name}</td></tr>
          <tr><th>Email</th><td>${email}</td></tr>
          <tr><th>Mobile</th><td>${mobile}</td></tr>
          <tr><th>Report</th><td>${reportType}</td></tr>
          <tr><th>Time</th><td>${new Date().toLocaleString()}</td></tr>
        </table>
      `,
    });

    res.json({ success: true });

  } catch (error) {
    console.error("❌ ERROR:", error);
    res.status(500).json({ success: false });
  }
});

app.get("/verify-brochure", (req, res) => {
  const { token } = req.query;

  try {
    jwt.verify(token, process.env.JWT_SECRET);

    // ✅ If valid → redirect to download
    return res.redirect(
      `https://vishwavishwani.ac.in/pgdm/download-brochure?token=${token}`
    );

  } catch (err) {
    return res.status(400).send("Invalid or expired link");
  }
});

app.get("/get-brochure", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    res.json({
      url: decoded.downloadLink
    });

  } catch (err) {
    res.status(403).json({ message: "Unauthorized or expired link" });
  }
});

// ✅ Default route
app.get("/", (req, res) => {
  res.send("Student Verification Backend Running ✅ (Cloudinary Enabled)");
});

// 🚀 Start server
app.listen(process.env.PORT || 5000, () => {
  console.log(`✅ Server running on port ${process.env.PORT || 5000}`);
});
export default app;