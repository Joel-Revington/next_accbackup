import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="stylesheet" href="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.css"></link>
        <link rel="stylesheet" href="https://unpkg.com/inspire-tree-dom@4.0.6/dist/inspire-tree-light.min.css"></link>
      </Head>
      <body>
        <script src="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.js" async></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js" async></script>
        <script src="https://unpkg.com/inspire-tree@4.3.1/dist/inspire-tree.js" async></script>
        <script src="https://unpkg.com/inspire-tree-dom@4.0.6/dist/inspire-tree-dom.min.js" async></script>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
