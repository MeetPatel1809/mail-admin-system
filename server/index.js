const fs = require("fs-extra");
const multer = require("multer");
const XLSX = require("xlsx");
const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "server/uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage: storage });

const bcrypt = require("bcrypt");
app.use(express.json());
app.post("/generate-mailboxes", async (req, res) => {
    try {

        const { domain, count, password, expiry_days } = req.body;

        // check domain exists
        const [domainCheck] = await db.query(
            "SELECT * FROM domains WHERE domain = ?",
            [domain]
        );

        if (!domainCheck.length) {
            return res.status(400).json({ error: "Domain not found" });
        }

        // get names
        const [names] = await db.query(
            "SELECT name FROM names LIMIT ?",
            [parseInt(count)]
        );

        if (!names.length) {
            return res.status(400).json({ error: "No names available" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + parseInt(expiry_days));

        const createdEmails = [];

        for (const row of names) {

            const username = row.name;
            const email = `${username}@${domain}`;

            try {

                await db.query(
                    `INSERT INTO mailboxes (email,password,domain,expiry_date,created_at)
       VALUES (?,?,?,?,NOW())`,
                    [email, hashedPassword, domain, expiryDate]
                );

                // mailbox path
                const basePath = `/var/mail/vhosts/${domain}/${username}/Maildir`;

                await fs.ensureDir(`${basePath}/cur`);
                await fs.ensureDir(`${basePath}/new`);
                await fs.ensureDir(`${basePath}/tmp`);

                createdEmails.push(email);

            } catch (err) {

                if (err.code === "ER_DUP_ENTRY") {
                    console.log(`Skipping duplicate: ${email}`);
                    continue;
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
        res.status(500).json({ error: "Mailbox generation failed" });
    }
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Mail Admin Backend Running");
});

app.get("/domains", (req, res) => {
    db.query("SELECT * FROM domains", (err, result) => {
        if (err) {
            res.status(500).send(err);
        } else {
            res.json(result);
        }
    });
});

app.post("/add-domain", (req, res) => {
    const { domain } = req.body;

    if (!domain) {
        return res.status(400).json({ message: "Domain is required" });
    }

    const sql = "INSERT INTO domains (domain) VALUES (?)";

    db.query(sql, [domain], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Error inserting domain" });
        }

        res.json({
            message: "Domain added successfully",
            domain: domain
        });
    });
});

app.post("/upload-names", upload.single("file"), (req, res) => {

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const data = XLSX.utils.sheet_to_json(sheet);

    let inserted = 0;

    data.forEach(row => {
        const name = row.name || row.Name || Object.values(row)[0];

        if (name) {
            db.query(
                "INSERT IGNORE INTO names (name) VALUES (?)",
                [name.toLowerCase()],
                () => { }
            );
            inserted++;
        }
    });

    res.json({
        message: "Names uploaded",
        total_rows: data.length
    });

});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});