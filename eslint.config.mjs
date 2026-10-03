import next from "eslint-config-next";

export default [
  ...next,
  { ignores: ["prototype/**", "drizzle/**", ".data/**"] },
];
