import assert from "node:assert/strict";
import {
    linearRegression,
    linearRegressionLine,
    mean,
    median,
    rSquared,
    sampleVariance,
} from "simple-statistics";
import { layout, type At, type Tree } from "./index.ts";

type Verdict = "pass" | "fail" | "inconclusive";

type Family = {
    readonly name: string;
    readonly make: (size: number) => Tree<number>;
};

type Sample = {
    readonly size: number;
    readonly repeats: number;
    readonly count: number;
    readonly medianMs: number;
};

type Point = {
    readonly x: number;
    readonly y: number;
};

type Interval = {
    readonly alphaLower: number;
    readonly alphaUpper: number;
    readonly slopeLower: number;
    readonly slopeUpper: number;
};

type Report = {
    readonly family: string;
    readonly alpha: number;
    readonly alphaLower: number;
    readonly alphaUpper: number;
    readonly coeff: number;
    readonly coeffLower: number;
    readonly coeffUpper: number;
    readonly slope: number;
    readonly lower: number;
    readonly upper: number;
    readonly fit: number;
    readonly verdict: Verdict;
    readonly samples: readonly Sample[];
};

type SampleState = {
    readonly size: number;
    readonly repeats: number;
    readonly source: Tree<number>;
    readonly values: readonly number[];
};

const sizes = [128, 256, 512, 1024, 2048, 4096] as const;
const warmupCount = 2;
const batchSize = 1;
const targetMs = 50;
const deadlineMs = 3 * 60 * 1000;

const runFamily = ({ name, make }: Family, deadline: number): Report => {
    const states = sizes.map((size) => prepareSample(size, make(size)));
    return runBatches(name, states, deadline);
};

const prepareSample = (size: number, source: Tree<number>): SampleState => {
    warm(source, 1, warmupCount);
    const roughMs = median(readRange(3).map(() => measureBatch(source, 1)));
    const repeats = readRepeats(roughMs);
    warm(source, repeats, warmupCount);

    return {
        size,
        repeats,
        source,
        values: [],
    };
};

const warm = (
    source: Tree<number>,
    repeats: number,
    count: number,
): number => (
    count <= 0
        ? 0
        : measureBatch(source, repeats) + warm(source, repeats, count - 1)
);

const runBatches = (
    family: string,
    states: readonly SampleState[],
    deadline: number,
): Report => {
    const next = states.map(addBatch);
    const report = readReport(family, next);

    return report.verdict === "inconclusive" && Date.now() < deadline
        ? runBatches(family, next, deadline)
        : report;
};

const addBatch = ({ size, repeats, source, values }: SampleState): SampleState => ({
    size,
    repeats,
    source,
    values: values.concat(readRange(batchSize).map(() => measureBatch(source, repeats))),
});

const readReport = (
    family: string,
    states: readonly SampleState[],
): Report => {
    const samples = states.map(finishSample);
    const points = states.flatMap(toPoints);
    const pairs = points.map(toPair);
    const model = linearRegression(pairs);
    const line = linearRegressionLine(model);
    const fit = rSquared(pairs, line);
    const interval = measureInterval(points, model.m, model.b);

    return {
        family,
        alpha: model.b,
        alphaLower: interval.alphaLower,
        alphaUpper: interval.alphaUpper,
        coeff: Math.exp(model.b),
        coeffLower: Math.exp(interval.alphaLower),
        coeffUpper: Math.exp(interval.alphaUpper),
        slope: model.m,
        lower: interval.slopeLower,
        upper: interval.slopeUpper,
        fit,
        verdict: readVerdict(interval),
        samples,
    };
};

const finishSample = ({ size, repeats, values }: SampleState): Sample => ({
    size,
    repeats,
    count: values.length,
    medianMs: median(values),
});

const measureBatch = (source: Tree<number>, repeats: number): number => {
    const start = process.hrtime.bigint();
    const total = readRange(repeats).reduce(
        (sum) => sum + checksum(layout(source)),
        0,
    );
    const end = process.hrtime.bigint();
    if (!Number.isFinite(total)) {
        throw new Error("Impossible");
    }
    return Number(end - start) / 1e6 / repeats;
};

const readRepeats = (roughMs: number): number => {
    const unitMs = Math.max(roughMs, 0.01);
    return Math.min(16384, Math.max(1, Math.ceil(targetMs / unitMs)));
};

const toPoint = (size: number, value: number): Point => ({
    x: Math.log(size),
    y: Math.log(Math.max(value, Number.EPSILON)),
});

const toPair = ({ x, y }: Point): number[] => [x, y];

const toPoints = ({ size, values }: SampleState): readonly Point[] => values.map((value) => (
    toPoint(size, value)
));

const measureInterval = (
    points: readonly Point[],
    slope: number,
    intercept: number,
): Interval => {
    const xs = points.map((point) => point.x);
    const xMean = mean(xs);
    const line = linearRegressionLine({
        m: slope,
        b: intercept,
    });
    const sse = points
        .map((point) => point.y - line(point.x))
        .reduce((sum, residual) => sum + residual * residual, 0);
    const df = points.length - 2;
    const ssx = sampleVariance(xs) * (xs.length - 1);
    const sigma2 = sse / df;
    const slopeSe = Math.sqrt(sigma2 / ssx);
    const alphaSe = Math.sqrt(
        sigma2 * ((1 / points.length) + (xMean * xMean) / ssx),
    );
    const t = readT99(df);

    return {
        alphaLower: intercept - t * alphaSe,
        alphaUpper: intercept + t * alphaSe,
        slopeLower: slope - t * slopeSe,
        slopeUpper: slope + t * slopeSe,
    };
};

const readVerdict = ({ slopeLower, slopeUpper }: Interval): Verdict => {
    if (slopeUpper < 1.1) {
        return "pass";
    }
    if (slopeLower > 1.1) {
        return "fail";
    }
    return "inconclusive";
};

const readT99 = (df: number): number => {
    const value = t99[df];
    return value === undefined ? 2.576 : value;
};

const t99 = [
    0,
    63.657,
    9.925,
    5.841,
    4.604,
    4.032,
    3.707,
    3.499,
    3.355,
    3.25,
    3.169,
    3.106,
    3.055,
    3.012,
    2.977,
    2.947,
    2.921,
    2.898,
    2.878,
    2.861,
    2.845,
    2.831,
    2.819,
    2.807,
    2.797,
    2.787,
    2.779,
    2.771,
    2.763,
    2.756,
    2.75,
] as const;

const checksum = ({ value: { x, y }, children }: Tree<At<number>>): number => (
    x + y + children.reduce((sum, child) => sum + checksum(child), 0)
);

const makeChain = (size: number): Tree<number> => (
    size <= 1 ? leaf(1) : tree(size, [makeChain(size - 1)])
);

const makeStar = (size: number): Tree<number> => (
    size <= 1
        ? leaf(1)
        : tree(size, readRange(size - 1).map((index) => leaf(index + 1)))
);

const makeBinaryComplete = (size: number): Tree<number> => makeHeap(2, size, 1);

const makeRose = (size: number): Tree<number> => makeHeap(3, size, 1);

const makeHeap = (
    width: number,
    size: number,
    index: number,
): Tree<number> => tree(
    index,
    readRange(width)
        .map((offset) => width * (index - 1) + offset + 2)
        .filter((child) => child <= size)
        .map((child) => makeHeap(width, size, child)),
);

const makeComb = (size: number): Tree<number> => {
    if (size <= 1) {
        return leaf(1);
    }
    if (size === 2) {
        return tree(size, [leaf(1)]);
    }
    return tree(size, [leaf(size - 1), makeComb(size - 2)]);
};

const makeRepeatBlock = (size: number): Tree<number> => {
    if (size <= 1) {
        return leaf(1);
    }

    const rest = size - 1;
    const copies = Math.floor(rest / 5);
    const extra = rest % 5;

    return tree(
        size,
        [
            ...readRange(copies).map(() => makeBlock()),
            ...readRange(extra).map((index) => leaf(index + 1)),
        ],
    );
};

const makeBlock = (): Tree<number> => tree(0, [
    tree(0, [leaf(0), leaf(0)]),
    leaf(0),
]);

const families: readonly Family[] = [
    {
        name: "chain(n)",
        make: makeChain,
    },
    {
        name: "star(n)",
        make: makeStar,
    },
    {
        name: "binaryComplete(h)",
        make: makeBinaryComplete,
    },
    {
        name: "rose(3, h)",
        make: makeRose,
    },
    {
        name: "comb(n)",
        make: makeComb,
    },
    {
        name: "repeatBlock(m, r)",
        make: makeRepeatBlock,
    },
] as const;

const tree = <T>(value: T, children: readonly Tree<T>[]): Tree<T> => ({
    value,
    children,
});

const leaf = <T>(value: T): Tree<T> => tree(value, []);

const readRange = (size: number): readonly number[] => Array.from(
    { length: size },
    (_, index) => index,
);

const formatReport = ({
    family,
    alpha,
    alphaLower,
    alphaUpper,
    coeff,
    coeffLower,
    coeffUpper,
    slope,
    lower,
    upper,
    fit,
    verdict,
    samples,
}: Report): string => [
    `${family}: ${verdict}`,
    `log(time_ms) = ${formatSigned(alpha)} + ${formatNumber(slope)} * log(n)`,
    `time_ms(n) = ${formatCoeff(coeff)} * n^${formatNumber(slope)}`,
    `alpha_99: [${formatSigned(alphaLower)}, ${formatSigned(alphaUpper)}]`,
    `coeff_99: [${formatCoeff(coeffLower)}, ${formatCoeff(coeffUpper)}]`,
    `slope: ${formatNumber(slope)}`,
    `99% CI: [${formatNumber(lower)}, ${formatNumber(upper)}]`,
    `R^2: ${formatNumber(fit)}`,
    "samples:",
    ...samples.map(formatSample),
].join("\n");

const formatSample = ({ size, repeats, count, medianMs }: Sample): string => (
    `  n=${size} repeats=${repeats} count=${count} median=${formatMs(medianMs)}`
);

const formatNumber = (value: number): string => value.toFixed(6);

const formatMs = (value: number): string => `${value.toFixed(6)} ms`;

const formatSigned = (value: number): string => (
    value < 0 ? value.toFixed(6) : `+${value.toFixed(6)}`
);

const formatCoeff = (value: number): string => value.toExponential(6);

const deadline = Date.now() + deadlineMs;

const reports = families.map((family) => runFamily(family, deadline));

console.log(reports.map(formatReport).join("\n\n"));

const failed = reports
    .filter((report) => report.verdict !== "pass")
    .map((report) => report.family);

assert.deepStrictEqual(failed, []);
