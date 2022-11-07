import express from "express";
import fs, { unwatchFile } from "fs";
import path from "path";
import https from "https";
import { auth, requiresAuth } from "express-openid-connect";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { Pool } from "pg";

dotenv.config();
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: "matchesdb",
  password: process.env.DB_PASSWORD,
  port: 5432,
  ssl: true,
});

var admin = true;
var injection = "false";

export async function getResultsSafe(team: any) {
  console.log("Trying to get results safely");
  const query = await pool.query("SELECT * from results");
  var results = await JSON.parse(JSON.stringify(query)).rows;
  for (let i = 0; i < results.length; i++) {
    if (results[i].nationalassociation.toLowerCase() == team.toLowerCase()) {
      return [results[i]];
    }
  }

  return undefined;
}

export async function getUserData() {
  console.log("Trying to get userdata safely");
  const query = await pool.query("SELECT * from users");
  var results = await JSON.parse(JSON.stringify(query)).rows;
  return results;
}
//' or ''='
//Netherlands' UNION SELECT  r.id, u.username,u.password, r.league, r.group, r.goaldiff FROM users u, results r --
export async function getResultsNotSafe(team: any) {
  console.log("Trying to get results NOT safely");
  const query = await pool.query(
    `SELECT * FROM results WHERE nationalassociation = '${team}'`
  );
  var results = await JSON.parse(JSON.stringify(query)).rows;
  return results;
}

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

const externalURL = process.env.RENDER_EXTERNAL_URL;

const port =
  externalURL && process.env.PORT ? parseInt(process.env.PORT) : 4080;

const config = {
  authRequired: false,
  idpLogout: true, //login not only from the app, but also from identity provider
  secret: process.env.SECRET,
  baseURL: externalURL || `https://localhost:${port}`,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: "https://web2-labs.eu.auth0.com",
  clientSecret: process.env.CLIENT_SECRET,
  authorizationParams: {
    response_type: "code",
    //scope: "openid profile email"
  },
};
// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

app.get("/", function (req, res) {
  let username: string | undefined;
  if (req.oidc.isAuthenticated()) {
    username = req.oidc.user?.name ?? req.oidc.user?.sub;
  }
  res.render("index", { username, admin });
});

app.get("/user", function (req, res) {
  res.render("user", { admin });
});

app.post("/user", function (req, res) {
  var userInput = "";
  if (
    req.body.injection.trim() == "true" ||
    req.body.injection.trim() == "false"
  ) {
    injection = req.body.injection.trim();
  }
  if (req.body.team) {
    userInput = req.body.team.trim();
  }
  var wantedTeam;
  if (injection == "true") {
    getResultsNotSafe(userInput).then(function (r) {
      wantedTeam = r;
      res.render("user", { wantedTeam, injection });
    });
  } else if (injection == "false") {
    injection = "false";
    getResultsSafe(userInput).then(function (r) {
      wantedTeam = r;
      res.render("user", { wantedTeam, injection });
    });
  } else {
    res.render("user", { wantedTeam, injection });
  }
  //console.log("Evo rezultat: ", wantedTeam);
});

app.get("/admin", function (req, res) {
  var userData;
  if (injection == "true") {
    userData = getUserData();
    userData.then(async function (r) {
      if (r != undefined) {
        userData = r;
        res.render("admin", { userData, injection });
        return;
      }
    });
  } else if (injection == "false") {
    res.render("admin", { injection });
  } else {
    res.render("admin", { injection });
  }
});

if (externalURL) {
  const hostname = "127.0.0.1";
  app.listen(port, hostname, function () {
    console.log(
      `Server running at https://${hostname}:${port}/ and from outside on ${externalURL}`
    );
  });
} else {
  https
    .createServer(
      {
        key: fs.readFileSync("server.key"),
        cert: fs.readFileSync("server.cert"),
      },
      app
    )
    .listen(port, function () {
      console.log(`Server running at https://localhost:${port}/`);
    });
}
