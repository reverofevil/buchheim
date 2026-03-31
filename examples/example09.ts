import { Tree } from "../src/index.ts";

export const example09 = Tree(1, [
    Tree(2, []),
    Tree(3, [
        Tree(4, []),
        Tree(5, []),
    ]),
]);
