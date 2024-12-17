const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const app = express();

const allowedOrigins = ["http://localhost:4200", "http://192.168.0.8:4200"];

app.use(
    cors({
        origin: allowedOrigins,
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

/* -----------------------------------------
    npm run test 
    npm run prod
----------------------------------------- */

const listenAddress = process.env.LISTEN_ADDRESS;

if (process.env.NODE_ENV.trim() === "production") {
    require("dotenv").config({ path: path.join(__dirname, "/env/prod.env") });
} else if (process.env.NODE_ENV.trim() === "development") {
    require("dotenv").config({ path: path.join(__dirname, "/env/dev.env") });
} else if (process.env.NODE_ENV.trim() === "staging") {
    require("dotenv").config({ path: path.join(__dirname, "/env/staging.env") });
}

/* -----------------------------------------
    PORT
----------------------------------------- */
var port = normalizePort(process.env.PORT);

app.set("port", port);

/* -----------------------------------------
    DB
----------------------------------------- */
const mongApp = require("./database/mongoDB");

// [API] Routers
app.use("/api/v1", require("./routes/api/v1"));

// static
app.use("/", express.static(path.join(__dirname, "/dist/client")));

http.createServer(app).listen(app.get("port"), listenAddress, () => {
    console.log(
        ` 
    +---------------------------------------------+
    |                                                 
    |      [ Potatocs Server ]
    |
    |      - Version:`,
        process.env.VERSION,
        `
    |
    |      - Mode: ${process.env.MODE}
    |                                      
    |      - Server is running on port ${app.get("port")}
    |
    +---------------------------------------------+
    `
    );

    /*----------------------------------
      CONNECT TO MONGODB SERVER
  ------------------------------------*/
    mongApp.appSetObjectId(app);
});

function normalizePort(val) {
    var port = parseInt(val, 10);
    if (isNaN(port)) {
        // named pipe
        return val;
    }
    if (port >= 0) {
        // port number
        return port;
    }
    return false;
}

app.use(function (req, res) {
    console.log(`
    ============================================
		>>>>>> Invalid Request! <<<<<<

		Req: "${req.url}"
		=> Redirect to 'index.html'
    ============================================`);
    res.sendFile(__dirname + "/client/index.html");
});
