const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const bcrypt = require("bcrypt");
const fs = require("fs-extra");

const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

/* ===========================
   FILE UPLOAD CONFIG
=========================== */

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "server/uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

/* ===========================
   ROOT
=========================== */

app.get("/", (req, res) => {
    res.send("Mail Admin Backend Running");
});

/* ===========================
   GET DOMAINS
=========================== */

app.get("/domains", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM domains");
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch domains" });
    }
});

/* ===========================
   ADD DOMAIN
=========================== */

app.post("/add-domain", async (req, res) => {
    try {

        const { domain } = req.body;

        if (!domain) {
            return res.status(400).json({ error: "Domain is required" });
        }

        await db.query(
            "INSERT INTO domains (domain) VALUES (?)",
            [domain]
        );

        res.json({
            success: true,
            message: "Domain added",
            domain
        });

    } catch (err) {

        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "Domain already exists" });
        }

        console.error(err);
        res.status(500).json({ error: "Domain creation failed" });

    }
});

/* ===========================
   GENERATE MAILBOXES
=========================== */

app.post("/generate-mailboxes", async (req, res) => {

    try {

        const { domain, count, password, expiry_days } = req.body;

        if (!domain || !count || !password || !expiry_days) {
            return res.status(400).json({
                error: "domain, count, password, expiry_days required"
            });
        }

        /* check domain exists */

        const [domainCheck] = await db.query(
            "SELECT * FROM domains WHERE domain = ?",
            [domain]
        );

        if (!domainCheck.length) {
            return res.status(400).json({
                error: "Domain not found"
            });
        }

        /* get unused names */

        const [names] = await db.query(
            `SELECT name
             FROM names
             WHERE name NOT IN (
                SELECT SUBSTRING_INDEX(email,'@',1)
                FROM mailboxes
                WHERE domain = ?
             )
             LIMIT ?`,
            [domain, parseInt(count)]
        );

        if (!names.length) {
            return res.status(400).json({
                error: "No unused names available"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const expiryDate = new Date();
        expiryDate.setDate(
            expiryDate.getDate() + parseInt(expiry_days)
        );

        const createdEmails = [];

        for (const row of names) {

            const username = row.name;
            const email = `${username}@${domain}`;

            try {

                await db.query(
                    `INSERT INTO mailboxes
                    (email,password,domain,expiry_date,created_at,active)
                    VALUES (?,?,?,?,NOW(),1)`,
                    [email, hashedPassword, domain, expiryDate]
                );

                createdEmails.push(email);

            } catch (err) {

                if (err.code === "ER_DUP_ENTRY") {
                    console.log(`Duplicate skipped: ${email}`);
                } else {
                    throw err;
                }

            }
        }

        res.json({
            success: true,
            created: createdEmails.length,
            emails: createdEmails
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Mailbox generation failed"
        });

    }

});

/* ===========================
   UPLOAD NAMES (EXCEL)
=========================== */

app.post("/upload-names", upload.single("file"), async (req, res) => {

    try {

        const workbook = XLSX.readFile(req.file.path);

        const sheet =
            workbook.Sheets[workbook.SheetNames[0]];

        const data = XLSX.utils.sheet_to_json(sheet);

        let inserted = 0;

        for (const row of data) {

            const name =
                row.name ||
                row.Name ||
                Object.values(row)[0];

            if (!name) continue;

            try {

                await db.query(
                    "INSERT IGNORE INTO names (name) VALUES (?)",
                    [name.toLowerCase()]
                );

                inserted++;

            } catch (err) {
                console.log(err);
            }
        }

        res.json({
            success: true,
            inserted
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Upload failed"
        });

    }

});

/* ===========================
   START SERVER
=========================== */

app.listen(5000, () => {
    console.log("Server running on port 5000");
});