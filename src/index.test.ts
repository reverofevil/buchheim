import assert from "node:assert/strict";
import test from "node:test";
import fc, { type Arbitrary, type Memo } from "fast-check";
import { At, Tree, layout, normalize } from "./index.ts";

test("layout places a root leaf at the origin", () => {
    assert.deepStrictEqual(layout(leaf("root")), Tree(At("root", 0, 0), []));
});

test("layout centers a parent above two leaves", () => {
    assert.deepStrictEqual(
        layout(Tree("r", [leaf("a"), leaf("b")])),
        Tree(At("r", 0.5, 0), [
            Tree(At("a", 0, 1), []),
            Tree(At("b", 1, 1), []),
        ]),
    );
});

test("layout spreads the reference three-child rose tree", () => {
    assert.deepStrictEqual(
        layout(Tree("r", [
            Tree("a", [leaf("x")]),
            leaf("b"),
            Tree("c", [leaf("y")]),
        ])),
        Tree(At("r", 1, 0), [
            Tree(At("a", 0, 1), [
                Tree(At("x", 0, 2), []),
            ]),
            Tree(At("b", 1, 1), []),
            Tree(At("c", 2, 1), [
                Tree(At("y", 2, 2), []),
            ]),
        ]),
    );
});

test("layout keeps every node at its depth", () => {
    fc.assert(fc.property(treeArb, (source) => depths(layout(source), 0).every(
        ({ depth, draw }) => draw.y === depth,
    )));
});

test("layout keeps disjoint edges from crossing", () => {
    fc.assert(fc.property(treeArb, (source) => {
        const allEdges = edges(layout(source));
        for (const [index, left] of allEdges.entries()) {
            for (const right of allEdges.slice(index + 1)) {
                if (!shareEndpoint(left, right) && crosses(left, right)) {
                    return false;
                }
            }
        }
        return true;
    }));
});

test("layout draws equal subtrees identically up to translation", () => {
    fc.assert(fc.property(treeArb, treeArb, (source, filler) => {
        const drawn = layout(Tree(0, [
            mapTree(source, (value) => value + 1),
            filler,
            mapTree(source, (value) => value + 1000),
        ]));
        const left = drawn.children[0];
        const right = drawn.children[2];
        if (left === undefined || right === undefined) {
            return false;
        }
        return sameShape(normalizeShape(left), normalizeShape(right));
    }));
});

test("layout preserves child order from left to right", () => {
    fc.assert(fc.property(treeArb, (source) => trees(layout(source)).every((drawn) => diffs(
        drawn.children.map((child) => child.value.x),
    ).every((gap) => gap > eps))));
});

test("layout mirrors tree layouts symmetrically", () => {
    fc.assert(fc.property(treeArb, (source) => sameShape(
        normalizeShape(layout(mirror(source))),
        reflectShape(normalizeShape(layout(source))),
    )));
});

test("layout normalizes the left-most node to x = 0", () => {
    fc.assert(fc.property(treeArb, (source) => close(
        Math.min(...draws(normalize(layout(source))).map((draw) => draw.x)),
        0,
    )));
});

test("layout never overlaps two nodes", () => {
    fc.assert(fc.property(treeArb, (source) => {
        const positions = draws(layout(source)).map((draw) => key(draw));
        return new Set(positions).size === positions.length;
    }));
});

test("layout preserves node values", () => {
    fc.assert(fc.property(treeArb, (source) => sameTree(
        strip(layout(source)),
        source,
    )));
});

test("layout centers every parent above its outer children", () => {
    fc.assert(fc.property(treeArb, (source) => trees(layout(source)).every((drawn) => {
        const span = childSpan(drawn);
        return span === undefined || close(
            drawn.value.x,
            (span.left + span.right) / 2,
        );
    })));
});

test("layout keeps the root at y = 0", () => {
    fc.assert(fc.property(treeArb, (source) => layout(source).value.y === 0));
});

test("layout keeps adjacent siblings at least one unit apart", () => {
    fc.assert(fc.property(treeArb, (source) => trees(layout(source)).every((drawn) => diffs(
        drawn.children.map((child) => child.value.x),
    ).every((gap) => gap + eps >= 1))));
});

const eps = 1e-9;

const leaf = <T>(value: T): Tree<T> => Tree(value, []);

const memoTree: Memo<Tree<number>> = fc.memo(
    (depth: number): Arbitrary<Tree<number>> => {
        const childrenArb: Arbitrary<readonly Tree<number>[]> = depth <= 1
            ? fc.constant([])
            : fc.array(memoTree(depth - 1), { maxLength: 3 });
        return fc.record({
            value: fc.integer({ min: -5, max: 5 }),
            children: childrenArb,
        }).map(({ value, children }) => Tree(value, children));
    },
);

const treeArb: Arbitrary<Tree<number>> = memoTree(5);

const draws = <T>(source: Tree<At<T>>): readonly At<T>[] => [
    source.value,
    ...source.children.flatMap((child) => draws(child)),
];

const trees = <T>(source: Tree<T>): readonly Tree<T>[] => [
    source,
    ...source.children.flatMap((child) => trees(child)),
];

const depths = <T>(
    source: Tree<At<T>>,
    depth: number,
): readonly Depth<T>[] => [
    { depth, draw: source.value },
    ...source.children.flatMap((child) => depths(child, depth + 1)),
];

const edges = <T>(source: Tree<At<T>>): readonly Edge<T>[] => [
    ...source.children.map((child) => ({
        start: source.value,
        end: child.value,
    })),
    ...source.children.flatMap((child) => edges(child)),
];

const mirror = <T>(source: Tree<T>): Tree<T> => Tree(
    source.value,
    [...source.children].reverse().map((child) => mirror(child)),
);

const mapTree = (
    source: Tree<number>,
    f: (value: number) => number,
): Tree<number> => Tree(
    f(source.value),
    source.children.map((child) => mapTree(child, f)),
);

const strip = <T>(source: Tree<At<T>>): Tree<T> => Tree(
    source.value.value,
    source.children.map((child) => strip(child)),
);

const sameTree = <T>(left: Tree<T>, right: Tree<T>): boolean => (
    Object.is(left.value, right.value) &&
    left.children.length === right.children.length &&
    left.children.every((child, index) => {
        const other = right.children[index];
        return other !== undefined && sameTree(child, other);
    })
);

const normalizeShape = <T>(source: Tree<At<T>>): Shape => shiftShape(
    source.value.x,
    source.value.y,
    source,
);

const shiftShape = <T>(
    rootX: number,
    rootY: number,
    source: Tree<At<T>>,
): Shape => ({
    x: source.value.x - rootX,
    y: source.value.y - rootY,
    children: source.children.map((child) => shiftShape(rootX, rootY, child)),
});

const reflectShape = (source: Shape): Shape => ({
    x: 0 - source.x,
    y: source.y,
    children: [...source.children].reverse().map((child) => reflectShape(child)),
});

const childSpan = <T>(
    source: Tree<At<T>>,
): { readonly left: number; readonly right: number } | undefined => {
    const first = source.children[0];
    const last = source.children[source.children.length - 1];
    if (first === undefined || last === undefined) {
        return undefined;
    }
    return {
        left: first.value.x,
        right: last.value.x,
    };
};

const diffs = (values: readonly number[]): readonly number[] => values.slice(1).map(
    (value, index) => value - values[index],
);

const crosses = <T>(left: Edge<T>, right: Edge<T>): boolean => {
    const o1 = orient(left.start, left.end, right.start);
    const o2 = orient(left.start, left.end, right.end);
    const o3 = orient(right.start, right.end, left.start);
    const o4 = orient(right.start, right.end, left.end);
    return (o1 !== o2 && o3 !== o4) ||
        (o1 === 0 && onSegment(left.start, left.end, right.start)) ||
        (o2 === 0 && onSegment(left.start, left.end, right.end)) ||
        (o3 === 0 && onSegment(right.start, right.end, left.start)) ||
        (o4 === 0 && onSegment(right.start, right.end, left.end));
};

const shareEndpoint = <T>(left: Edge<T>, right: Edge<T>): boolean => (
    samePoint(left.start, right.start) ||
    samePoint(left.start, right.end) ||
    samePoint(left.end, right.start) ||
    samePoint(left.end, right.end)
);

const samePoint = <T>(left: At<T>, right: At<T>): boolean => (
    close(left.x, right.x) &&
    left.y === right.y
);

const orient = <T>(a: At<T>, b: At<T>, c: At<T>): -1 | 0 | 1 => {
    const det = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (close(det, 0)) {
        return 0;
    }
    return det > 0 ? 1 : -1;
};

const onSegment = <T>(a: At<T>, b: At<T>, c: At<T>): boolean => (
    between(a.x, b.x, c.x) &&
    between(a.y, b.y, c.y)
);

const between = (a: number, b: number, c: number): boolean => (
    Math.min(a, b) - eps <= c &&
    c <= Math.max(a, b) + eps
);

const close = (left: number, right: number): boolean => (
    Math.abs(left - right) <= eps
);

const sameShape = (left: Shape, right: Shape): boolean => (
    close(left.x, right.x) &&
    left.y === right.y &&
    left.children.length === right.children.length &&
    left.children.every((child, index) => {
        const other = right.children[index];
        return other !== undefined && sameShape(child, other);
    })
);

const key = <T>(draw: At<T>): string => (
    `${Math.round(draw.x * 1e9)}:${draw.y}`
);

type Depth<T> = {
    readonly depth: number;
    readonly draw: At<T>;
};

type Edge<T> = {
    readonly start: At<T>;
    readonly end: At<T>;
};

type Shape = {
    readonly x: number;
    readonly y: number;
    readonly children: readonly Shape[];
};
