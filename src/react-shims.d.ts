/**
 * 最小化 React 类型声明（离线环境无法安装 @types/react）。
 * 仅覆盖本项目实际使用到的 API；若恢复网络请改用官方 @types/react。
 */

type ShimReactNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | {
      readonly type: unknown;
      readonly props: Record<string, unknown>;
      readonly key: string | null;
    }
  | ShimReactNode[];

declare module "react" {
  export type ReactNode = ShimReactNode;

  export interface ReactElement {
    readonly type: unknown;
    readonly props: Record<string, unknown>;
    readonly key: string | null;
  }

  export interface FC<P = Record<string, never>> {
    (props: P): ReactNode;
  }

  type SetStateAction<S> = S | ((prev: S) => S);
  type Dispatch<A> = (value: A) => void;
  type DependencyList = readonly unknown[];

  export function useState<S>(
    initialState: S | (() => S)
  ): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [
    S | undefined,
    Dispatch<SetStateAction<S | undefined>>
  ];

  export function useEffect(
    effect: () => void | (() => void),
    deps?: DependencyList
  ): void;

  export function useMemo<T>(factory: () => T, deps: DependencyList | undefined): T;

  const React: {
    StrictMode: FC<{ children?: ReactNode }>;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export function jsx(
    type: unknown,
    props: Record<string, unknown>,
    key?: string | null
  ): ShimReactNode;
  export const jsxs: typeof jsx;
  export const Fragment: unique symbol;
}

declare module "react-dom/client" {
  import type { ReactNode } from "react";

  interface Root {
    render(node: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment): Root;
}

declare namespace JSX {
  type Element = ShimReactNode;

  interface CommonProps {
    children?: ShimReactNode;
    className?: string;
    key?: string | number;
    title?: string;
    role?: string;
    [attr: string]: unknown;
  }

  interface InputProps extends CommonProps {
    value?: string | number;
    defaultValue?: string | number;
    placeholder?: string;
    type?: string;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    disabled?: boolean;
    rows?: number;
    onChange?: (event: any) => void;
    onClick?: (event: any) => void;
  }

  interface IntrinsicElements {
    main: CommonProps;
    section: CommonProps;
    article: CommonProps;
    aside: CommonProps;
    div: CommonProps;
    header: CommonProps;
    h1: CommonProps;
    h2: CommonProps;
    h3: CommonProps;
    p: CommonProps;
    span: CommonProps;
    i: CommonProps;
    em: CommonProps;
    b: CommonProps;
    strong: CommonProps;
    ul: CommonProps;
    li: CommonProps;
    label: CommonProps;
    button: InputProps;
    input: InputProps;
    select: InputProps;
    option: CommonProps & { value?: string };
    textarea: InputProps;
  }
}
