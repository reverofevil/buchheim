import { writeFile } from "node:fs/promises";
import { normalize, layout, type At, type Tree } from "../src/index.ts";
import { example01 } from "./example01.ts";
import { example02 } from "./example02.ts";
import { example03 } from "./example03.ts";
import { example04 } from "./example04.ts";
import { example05 } from "./example05.ts";
import { example06 } from "./example06.ts";
import { example07 } from "./example07.ts";
import { example08 } from "./example08.ts";
import { example09 } from "./example09.ts";
import { example10 } from "./example10.ts";
import { example11 } from "./example11.ts";
import { example12 } from "./example12.ts";
import { example13 } from "./example13.ts";
import { example14 } from "./example14.ts";
import { example15 } from "./example15.ts";

type Example<T> = {
    readonly name: string;
    readonly tree: Tree<T>;
    readonly svgUrl: URL;
};

type Edge<T> = {
    readonly start: At<T>;
    readonly end: At<T>;
};

type Bounds = {
    readonly maxX: number;
    readonly maxY: number;
};

const gap = 56;
const padding = 40;
const radius = 18;

const run = async (): Promise<void> => {
    if (examples.length === 0) {
        throw new Error("Missing example##.ts entries in examples/display.ts.");
    }
    for (const example of examples) {
        await buildExample(example);
    }
};

const makeExample = <T>(
    name: string,
    tree: Tree<T>,
): Example<T> => {
    return Object.freeze({
        name,
        tree,
        svgUrl: new URL(`${name}.svg`, import.meta.url),
    });
};

const examples: readonly Example<number>[] = [
    makeExample("example01", example01),
    makeExample("example02", example02),
    makeExample("example03", example03),
    makeExample("example04", example04),
    makeExample("example05", example05),
    makeExample("example06", example06),
    makeExample("example07", example07),
    makeExample("example08", example08),
    makeExample("example09", example09),
    makeExample("example10", example10),
    makeExample("example11", example11),
    makeExample("example12", example12),
    makeExample("example13", example13),
    makeExample("example14", example14),
    makeExample("example15", example15),
];

const buildExample = async <T>(example: Example<T>): Promise<void> => {
    const svg = renderSvg(example.tree, example.name);
    await writeFile(example.svgUrl, `${svg}\n`, "utf8");
};

const renderSvg = <T>(tree: Tree<T>, name: string): string => {
    const drawn = normalize(layout(tree));
    const bounds = getBounds(drawn);
    const width = toScreenX(bounds.maxX) + padding;
    const height = toScreenY(bounds.maxY) + padding;
    const lines = collectEdges(drawn).map((edge) => renderEdge(edge));
    const circles = collectDraws(drawn).map((draw) => renderNode(draw));
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" width="${formatNumber(width)}" height="${formatNumber(height)}">`,
        "  <g stroke=\"#475569\" stroke-width=\"2\" fill=\"none\">",
        ...lines.map((line) => `    ${line}`),
        "  </g>",
        "  <g fill=\"#e2e8f0\" stroke=\"#0f172a\" stroke-width=\"2\">",
        ...circles.map((circle) => `    ${circle}`),
        "  </g>",
        "</svg>",
    ].join("\n");
};

const collectDraws = <T>(tree: Tree<At<T>>): readonly At<T>[] => [
    tree.value,
    ...tree.children.flatMap((child) => collectDraws(child)),
];

const collectEdges = <T>(tree: Tree<At<T>>): readonly Edge<T>[] => [
    ...tree.children.map((child) => Object.freeze({
        start: tree.value,
        end: child.value,
    })),
    ...tree.children.flatMap((child) => collectEdges(child)),
];

const getBounds = <T>(tree: Tree<At<T>>): Bounds => {
    const draws = collectDraws(tree);
    return Object.freeze({
        maxX: Math.max(...draws.map((draw) => draw.x)),
        maxY: Math.max(...draws.map((draw) => draw.y)),
    });
};

const toScreenX = (x: number): number => padding + x * gap;

const toScreenY = (y: number): number => padding + y * gap;

const renderEdge = <T>(edge: Edge<T>): string => (
    `<line x1="${formatNumber(toScreenX(edge.start.x))}" y1="${formatNumber(toScreenY(edge.start.y))}" x2="${formatNumber(toScreenX(edge.end.x))}" y2="${formatNumber(toScreenY(edge.end.y))}"/>`
);

const renderNode = <T>(draw: At<T>): string => [
    `<circle cx="${formatNumber(toScreenX(draw.x))}" cy="${formatNumber(toScreenY(draw.y))}" r="${String(radius)}"/>`,
].join("");

const formatNumber = (value: number): string => String(
    Math.round(value * 1000) / 1000,
);

void run();
