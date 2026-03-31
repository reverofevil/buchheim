export type Tree<T> = {
    readonly value: T;
    readonly children: readonly Tree<T>[];
};

export const Tree = <T>(value: T, children: readonly Tree<T>[]): Tree<T> => ({
    value,
    children,
});

export type At<T> = {
    readonly value: T;
    readonly x: number;
    readonly y: number;
};

export const At = <T>(value: T, x: number, y: number): At<T> => ({
    value,
    x,
    y,
});

export const layout = <T>(tree: Tree<T>): Tree<At<T>> => {
    const root = build(tree, undefined, 0, 1, undefined, undefined);
    first(root);
    second(root, 0 - root.mod);
    return finish(root);
};

export const normalize = <T>(tree: Tree<At<T>>): Tree<At<T>> => shiftTree(
    tree,
    0 - minTreeX(tree),
);

type Node<T> = {
    value: T;
    x: number;
    y: number;
    mod: number;
    change: number;
    shift: number;
    i: number;
    parent: Node<T> | undefined;
    left: Node<T> | undefined;
    leftmost: Node<T> | undefined;
    thread: Node<T> | undefined;
    ancestor: Node<T> | undefined;
    children: Node<T>[];
};

const build = <T>(
    { value, children }: Tree<T>,
    parent: Node<T> | undefined,
    y: number,
    i: number,
    left: Node<T> | undefined,
    leftmost: Node<T> | undefined,
): Node<T> => {
    const v: Node<T> = {
        value,
        x: 0,
        y,
        mod: 0,
        change: 0,
        shift: 0,
        i,
        parent,
        left,
        leftmost,
        thread: undefined,
        ancestor: undefined,
        children: [],
    };
    v.ancestor = v;

    let w: Node<T> | undefined = undefined;
    const cs: Node<T>[] = [];
    for (const [k, child] of children.entries()) {
        const u: Node<T> = build(child, v, y + 1, k + 1, w, cs[0]);
        cs.push(u);
        w = u;
    }
    v.children = cs;
    return v;
};

const first = <T>(v: Node<T>): void => {
    if (v.children.length === 0) {
        v.x = v.left === undefined ? 0 : v.left.x + 1;
        return;
    }

    const firstChild = v.children[0];
    const lastChild = v.children[v.children.length - 1];
    if (firstChild === undefined || lastChild === undefined) {
        throw new Error("Impossible");
    }

    let a = firstChild;
    for (const w of v.children) {
        first(w);
        a = apportion(w, a);
    }

    execute(v);

    const mid = (firstChild.x + lastChild.x) / 2;
    if (v.left !== undefined) {
        v.x = v.left.x + 1;
        v.mod = v.x - mid;
        return;
    }

    v.x = mid;
};

const apportion = <T>(v: Node<T>, a: Node<T>): Node<T> => {
    if (v.left === undefined || v.leftmost === undefined) {
        return a;
    }

    let vir = v;
    let vor = v;
    let vil = v.left;
    let vol = v.leftmost;
    let sir = v.mod;
    let sor = v.mod;
    let sil = vil.mod;
    let sol = vol.mod;

    for (;;) {
        const nrVil = nextRight(vil);
        const nlVir = nextLeft(vir);
        if (nrVil === undefined || nlVir === undefined) {
            break;
        }

        const nlVol = nextLeft(vol);
        const nrVor = nextRight(vor);
        if (nlVol === undefined || nrVor === undefined) {
            throw new Error("Impossible");
        }

        vil = nrVil;
        vir = nlVir;
        vol = nlVol;
        vor = nrVor;
        vor.ancestor = v;

        const shift = (vil.x + sil) - (vir.x + sir) + 1;
        if (shift > 0) {
            const u = ancestor(vil, v, a);
            moveSubtree(u, v, shift);
            sir += shift;
            sor += shift;
        }

        sil += vil.mod;
        sir += vir.mod;
        sol += vol.mod;
        sor += vor.mod;
    }

    if (nextRight(vil) !== undefined && nextRight(vor) === undefined) {
        vor.thread = nextRight(vil);
        vor.mod += sil - sor;
        return a;
    }

    if (nextLeft(vir) !== undefined && nextLeft(vol) === undefined) {
        vol.thread = nextLeft(vir);
        vol.mod += sir - sol;
    }

    return v;
};

const moveSubtree = <T>(wl: Node<T>, wr: Node<T>, shift: number): void => {
    const n = wr.i - wl.i;
    if (n <= 0) {
        throw new Error("Impossible");
    }

    const q = shift / n;
    wr.change -= q;
    wl.change += q;
    wr.shift += shift;
    wr.x += shift;
    wr.mod += shift;
};

const execute = <T>(v: Node<T>): void => {
    let shift = 0;
    let change = 0;
    for (const w of [...v.children].reverse()) {
        w.x += shift;
        w.mod += shift;
        change += w.change;
        shift += w.shift + change;
    }
};

const ancestor = <T>(vil: Node<T>, v: Node<T>, a: Node<T>): Node<T> => {
    if (
        v.parent !== undefined &&
        vil.ancestor !== undefined &&
        vil.ancestor.parent === v.parent
    ) {
        return vil.ancestor;
    }
    return a;
};

const second = <T>(v: Node<T>, m: number): void => {
    v.x += m;
    for (const w of v.children) {
        second(w, m + v.mod);
    }
};

const finish = <T>({ value, x, y, children }: Node<T>): Tree<At<T>> => Tree(
    At(value, x, y),
    children.map((child) => finish(child)),
);

const minTreeX = <T>({ value, children }: Tree<At<T>>): number => Math.min(
    value.x,
    ...children.map((child) => minTreeX(child)),
);

const shiftTree = <T>(
    { value: { value, x, y }, children }: Tree<At<T>>,
    dx: number,
): Tree<At<T>> => Tree(
    At(value, x + dx, y),
    children.map((child) => shiftTree(child, dx)),
);

const nextLeft = <T>({ children, thread }: Node<T>): Node<T> | undefined => (
    children.length === 0 ? thread : children[0]
);

const nextRight = <T>({ children, thread }: Node<T>): Node<T> | undefined => (
    children.length === 0 ? thread : children[children.length - 1]
);
