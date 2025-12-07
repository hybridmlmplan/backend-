import levelRoutes from "./routes/levelRoutes.js";
import fundRoutes from "./routes/fundRoutes.js";

app.use("/api/level", levelRoutes);
app.use("/api/fund", fundRoutes);
