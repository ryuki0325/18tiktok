// hls.js の軽量版（字幕・DRMなし）は型定義の出口がないため、本体の型を使う
declare module "hls.js/light" {
  import Hls from "hls.js";
  export default Hls;
}
