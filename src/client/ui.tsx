/**
 * 客户端共享控件与主题样式。
 * 导出 ClientStyles、Button、Switch、Modal，保持与宿主管理页一致的视觉和键盘语义。
 */

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';

/** VS Code Codicons 的 MCP 图形，来源：https://github.com/microsoft/vscode-codicons（MIT）。 */
const MCP_ICON_PATH =
  'M14.5565 7.87462C14.5385 7.89312 14.5205 7.91112 14.5025 7.92862L8.69849 13.6201C8.62599 13.6906 8.62449 13.8061 8.69499 13.8786C8.69599 13.8801 8.69749 13.8811 8.69849 13.8821L9.89049 15.0516C10.1075 15.2626 10.1125 15.6101 9.90149 15.8276C9.89799 15.8311 9.89449 15.8351 9.89049 15.8386C9.66699 16.0556 9.31199 16.0556 9.08849 15.8386L7.89649 14.6701C7.38949 14.1776 7.37799 13.3671 7.87049 12.8601C7.87899 12.8511 7.88749 12.8426 7.89649 12.8341L13.7005 7.14212C14.352 6.50762 14.3665 5.46512 13.732 4.81362C13.7215 4.80312 13.711 4.79262 13.7005 4.78212L13.667 4.74962C12.998 4.09862 11.9325 4.09762 11.2625 4.74762L6.48099 9.43712L6.47949 9.43862L6.41399 9.50312C6.19049 9.72062 5.83449 9.72062 5.61149 9.50312C5.39449 9.29162 5.38949 8.94462 5.60049 8.72712C5.60399 8.72362 5.60749 8.71962 5.61149 8.71612L10.46 3.96062C11.1105 3.32512 11.123 2.28262 10.4875 1.63212C10.478 1.62212 10.468 1.61262 10.458 1.60262C9.78799 0.950619 8.72099 0.950619 8.05149 1.60262L1.63499 7.89512C1.41149 8.11212 1.05649 8.11212 0.832987 7.89512C0.615987 7.68412 0.610987 7.33662 0.821987 7.11912C0.825487 7.11562 0.828987 7.11162 0.832987 7.10812L7.24999 0.815119C8.36599 -0.271381 10.1445 -0.271381 11.2605 0.815119C11.8905 1.42762 12.189 2.30512 12.063 3.17512C12.9435 3.05012 13.8325 3.34062 14.469 3.96162L14.5025 3.99512C15.5885 5.05162 15.613 6.78812 14.5565 7.87412V7.87462ZM12.8655 6.32212C13.083 6.11062 13.0875 5.76362 12.8765 5.54612C12.873 5.54262 12.8695 5.53862 12.8655 5.53512C12.642 5.31762 12.286 5.31762 12.063 5.53512L7.31699 10.1896C6.64699 10.8416 5.57999 10.8416 4.91049 10.1896C4.25899 9.55512 4.24449 8.51262 4.87899 7.86112C4.88949 7.85062 4.89999 7.84012 4.91049 7.82962L9.65699 3.17512C9.87399 2.96362 9.87899 2.61662 9.66799 2.39912C9.66449 2.39562 9.66099 2.39162 9.65699 2.38812C9.43349 2.17062 9.07749 2.17062 8.85449 2.38812L4.10849 7.04262C3.02249 8.09912 2.99799 9.83562 4.05449 10.9216C4.07249 10.9401 4.09049 10.9581 4.10849 10.9756C5.22499 12.0616 7.00299 12.0616 8.11899 10.9756L12.8655 6.32112V6.32212Z';

/** MCP 图标。 */
export function McpIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path fillRule="evenodd" clipRule="evenodd" d={MCP_ICON_PATH} />
    </svg>
  );
}

/** 可参与弹层焦点循环的控件。 */
const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';

/** 每个文档的弹层堆栈，保证 Escape 与 Tab 只作用于最上层。 */
const MODAL_LAYERS = new WeakMap<Document, { element: HTMLElement; close: () => void }[]>();

/** 管理弹层焦点、Escape、Tab 与关闭后的焦点返回。 */
function useModalLayer(
  dialog: RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    if (!open || element === null) return undefined;
    const document = element.ownerDocument;
    const previous = document.activeElement;
    const stack = MODAL_LAYERS.get(document) ?? [];
    MODAL_LAYERS.set(document, stack);
    const layer = { element, close: () => close.current() };
    stack.push(layer);
    const initial =
      element.querySelector<HTMLElement>('[data-modal-autofocus]') ??
      element.querySelector<HTMLElement>(FOCUSABLE) ??
      element;
    if (!element.contains(document.activeElement)) initial.focus({ preventScroll: true });

    /** 处理最上层弹层的键盘操作。 */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        stack.at(-1) !== layer ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return;
      }
      if (event.key === 'Escape' && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => !item.closest('[inert], [hidden]'),
      );
      const first = items[0] ?? element;
      const last = items.at(-1) ?? element;
      const atEdge = event.shiftKey
        ? document.activeElement === first
        : document.activeElement === last;
      if (
        document.activeElement === element ||
        !element.contains(document.activeElement) ||
        atEdge
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      const wasTop = stack.at(-1) === layer;
      stack.splice(stack.indexOf(layer), 1);
      document.removeEventListener('keydown', onKeyDown);
      if (stack.length === 0) MODAL_LAYERS.delete(document);
      if (!wasTop) return;
      const target =
        previous instanceof HTMLElement && previous.isConnected ? previous : stack.at(-1)?.element;
      target?.focus({ preventScroll: true });
    };
  }, [dialog, open]);
}

/** 按钮属性。 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉层级。 */
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  /** 控件尺寸。 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否正在执行操作。 */
  busy?: boolean;
}

/** 宿主风格按钮。 */
export function Button({
  variant = 'outline',
  size = 'sm',
  busy = false,
  disabled,
  className,
  type = 'button',
  ...props
}: ButtonProps): JSX.Element {
  const classes = [
    'better-mcp-button',
    `better-mcp-button-${variant}`,
    `better-mcp-button-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      {...props}
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    />
  );
}

/** 开关属性。 */
export interface SwitchProps {
  /** 当前状态。 */
  checked: boolean;
  /** 状态切换回调。 */
  onChange: (checked: boolean) => void;
  /** 可访问名称。 */
  label: string;
  /** 是否禁用。 */
  disabled?: boolean;
  /** 悬浮说明。 */
  title?: string;
  /** 辅助说明元素 id。 */
  describedBy?: string;
}

/** 宿主风格开关。 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  title,
  describedBy,
}: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      title={title}
      disabled={disabled}
      className="better-mcp-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="better-mcp-switch-thumb" aria-hidden="true" />
    </button>
  );
}

/** 弹层属性。 */
export interface ModalProps {
  /** 是否显示。 */
  open: boolean;
  /** 关闭回调。 */
  onClose: () => void;
  /** 标题与可访问名称。 */
  title: string;
  /** 关闭按钮名称。 */
  closeLabel: string;
  /** 标题栏操作。 */
  actions?: ReactNode;
  /** 补充说明。 */
  description?: string | undefined;
  /** 固定底部操作。 */
  footer?: ReactNode;
  /** 弹层附加类名。 */
  className?: string;
  /** 正文附加类名。 */
  bodyClassName?: string;
  /** 弹层测试选择器。 */
  testId?: string;
  /** 弹层内容。 */
  children?: ReactNode;
}

/** 带焦点管理与主题材质的宿主风格弹层。 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  actions,
  description,
  footer,
  className,
  bodyClassName,
  testId = 'better-mcp-modal',
  children,
}: ModalProps): JSX.Element | null {
  const dialog = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  useModalLayer(dialog, open, onClose);
  if (!open) return null;
  const dialogClasses = ['better-mcp-dialog', className].filter(Boolean).join(' ');
  const bodyClasses = ['better-mcp-dialog-body', bodyClassName].filter(Boolean).join(' ');
  return createPortal(
    <div className="better-mcp-modal-root" role="presentation">
      <div className="better-mcp-modal-mask" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={
          description !== undefined && description !== '' ? descriptionId : undefined
        }
        className={dialogClasses}
        data-testid={testId}
      >
        <div className="better-mcp-dialog-content">
          <div className="better-mcp-dialog-header">
            <h2 className="better-mcp-dialog-title">{title}</h2>
            {actions !== undefined ? (
              <div className="better-mcp-dialog-actions">{actions}</div>
            ) : null}
            <Button
              variant="ghost"
              className="better-mcp-dialog-close"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </div>
          {description !== undefined && description !== '' ? (
            <p className="better-mcp-dialog-description" id={descriptionId}>
              {description}
            </p>
          ) : null}
          <div className={bodyClasses}>{children}</div>
        </div>
        {footer !== undefined ? <div className="better-mcp-dialog-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** 在组件树中挂载本插件的局部样式。 */
export function ClientStyles(): JSX.Element {
  return <style data-better-mcp-styles="">{CLIENT_STYLES}</style>;
}

/** 面板、表单与共享控件的主题化样式。 */
export const CLIENT_STYLES = String.raw`
.better-mcp-page,
.better-mcp-dialog {
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.better-mcp-page *,
.better-mcp-dialog * {
  box-sizing: border-box;
}
.better-mcp-sidebar-action {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
}
.better-mcp-sidebar-action[data-wide='true'] {
  justify-content: flex-start;
  padding: 6px 8px;
}
.better-mcp-sidebar-action[data-wide='false'] {
  justify-content: center;
  padding: 6px;
}
.better-mcp-summary {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.better-mcp-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font-family: inherit;
  font-weight: 400;
  white-space: nowrap;
}
.better-mcp-button-sm {
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 18px;
}
.better-mcp-button-md {
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--dsw-radius-md);
  font-size: 13px;
  line-height: 20px;
}
.better-mcp-button-lg {
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--dsw-radius-md);
  font-size: 14px;
  line-height: 22px;
}
.better-mcp-button-outline {
  box-shadow: inset 0 0 0 var(--dsh-hairline-width) var(--dsw-alias-border-l3);
}
.better-mcp-button-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.better-mcp-button-danger {
  color: var(--dsw-alias-state-error-primary);
  box-shadow: inset 0 0 0 var(--dsh-hairline-width) color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);
}
.better-mcp-button:disabled {
  cursor: default;
  opacity: 0.4;
}
.better-mcp-button:focus-visible,
.better-mcp-sidebar-action:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
@media (hover: hover) {
  .better-mcp-button-outline:not(:disabled):hover,
  .better-mcp-button-ghost:not(:disabled):hover,
  .better-mcp-sidebar-action:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }
  .better-mcp-button-primary:not(:disabled):hover {
    background: var(--dsw-alias-button-primary-hover);
  }
  .better-mcp-button-danger:not(:disabled):hover {
    background: var(--dsw-alias-interactive-bg-hover-danger);
  }
}
.better-mcp-switch {
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  margin: 0;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
}
.better-mcp-switch[aria-checked='true'] {
  background: var(--dsw-alias-brand-primary);
}
.better-mcp-switch:disabled {
  cursor: default;
  opacity: 0.5;
}
.better-mcp-switch:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.better-mcp-switch-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-foreground);
  transition: transform 120ms ease;
}
.better-mcp-switch[aria-checked='false'] .better-mcp-switch-thumb {
  background: var(--dsw-alias-switch-thumb);
}
.better-mcp-switch[aria-checked='true'] .better-mcp-switch-thumb {
  transform: translateX(16px);
}
.better-mcp-modal-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, var(--dsh-frame-overlay-top, 24px)) 24px;
}
.better-mcp-modal-mask {
  position: absolute;
  inset: var(--dsh-frame-chrome-top, 0px) 0 0;
  backdrop-filter: var(--dsw-mask-blur);
}
.better-mcp-modal-mask::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
}
.better-mcp-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: 100%;
  overflow: hidden;
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
}
.better-mcp-dialog-form {
  width: min(640px, 100%);
}
.better-mcp-dialog-confirm {
  width: min(420px, 100%);
}
.better-mcp-dialog:focus {
  outline: none;
}
.better-mcp-dialog-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.better-mcp-dialog-header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 20px 16px 12px 24px;
}
.better-mcp-dialog-title {
  min-width: 0;
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.better-mcp-dialog-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}
.better-mcp-dialog-close {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 20px;
}
.better-mcp-dialog-description {
  margin: 0;
  padding: 0 24px 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.better-mcp-dialog-body {
  flex: 1;
  min-height: 0;
  padding: 0 24px 20px;
  overflow-y: auto;
  scrollbar-color: var(--dsw-alias-scrollbar-hover-l2) var(--dsw-alias-scrollbar-bg-l2);
}
.better-mcp-dialog-footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px 20px;
  border-top: var(--dsh-hairline-width) solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
}
.better-mcp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.better-mcp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.better-mcp-section-title {
  flex: 1;
  min-width: 120px;
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.better-mcp-panel-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.better-mcp-server-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
.better-mcp-server {
  min-width: 0;
  padding: 16px 2px;
  border-bottom: var(--dsh-hairline-width) solid var(--dsw-alias-border-l2);
}
.better-mcp-server:first-child {
  padding-top: 4px;
}
.better-mcp-server:last-child {
  border-bottom: 0;
}
.better-mcp-server-line {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.better-mcp-server-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.better-mcp-server-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.better-mcp-server-name {
  color: var(--dsw-alias-label-primary);
  font-size: 13.5px;
  line-height: 20px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.better-mcp-badge {
  display: inline-flex;
  align-items: center;
  min-height: 19px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 17px;
}
.better-mcp-server-side {
  display: flex;
  flex: none;
  align-items: center;
  gap: 16px;
}
.better-mcp-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12.5px;
  line-height: 18px;
  white-space: nowrap;
}
.better-mcp-state[data-state='failed'] {
  color: var(--dsw-alias-state-error-primary);
}
.better-mcp-state-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
}
.better-mcp-state-dot[data-state='connected'] {
  background: var(--dsw-alias-state-success-primary);
}
.better-mcp-state-dot[data-state='connecting'],
.better-mcp-state-dot[data-state='reconnecting'] {
  background: var(--dsw-alias-state-business-primary);
}
.better-mcp-state-dot[data-state='waiting-credentials'] {
  background: var(--dsw-alias-state-warn-primary);
}
.better-mcp-state-dot[data-state='failed'] {
  background: var(--dsw-alias-state-error-primary);
}
.better-mcp-lazy {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.better-mcp-lazy-note {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-description {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.better-mcp-server-extra {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  margin: 10px 0 0;
}
.better-mcp-server-meta,
.better-mcp-server-url {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-server-url {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.better-mcp-diagnostics {
  margin: 0;
  padding: 8px 10px;
  border-left: 2px solid var(--dsw-alias-state-error-primary);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-diagnostics summary {
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.better-mcp-diagnostics p {
  margin: 8px 0 0;
}
.better-mcp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.better-mcp-feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-feedback-error {
  color: var(--dsw-alias-state-error-primary);
}
.better-mcp-feedback span {
  flex: 1;
  min-width: 0;
}
.better-mcp-feedback a {
  color: var(--dsw-alias-state-business-primary);
  overflow-wrap: anywhere;
}
.better-mcp-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.better-mcp-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.better-mcp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.better-mcp-field-full {
  grid-column: 1 / -1;
}
.better-mcp-label {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
}
.better-mcp-label-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
}
.better-mcp-help {
  position: relative;
  display: inline-flex;
}
.better-mcp-help-trigger {
  width: 16px;
  height: 16px;
  padding: 0;
  border: var(--dsh-hairline-width) solid var(--dsw-alias-border-l4);
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: help;
  font-size: 11px;
  line-height: 14px;
}
.better-mcp-help-trigger:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.better-mcp-help-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: -8px;
  z-index: 20;
  display: none;
  width: 280px;
  max-width: 80vw;
  padding: 8px 10px;
  border: var(--dsh-hairline-width) solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  overflow-wrap: anywhere;
}
.better-mcp-help:hover .better-mcp-help-tooltip,
.better-mcp-help:focus-within .better-mcp-help-tooltip {
  display: block;
}
.better-mcp-autocomplete {
  position: relative;
  min-width: 0;
}
.better-mcp-autocomplete-options {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  max-height: 220px;
  padding: 4px;
  overflow-y: auto;
  border: var(--dsh-hairline-width) solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
}
.better-mcp-autocomplete-options[hidden] {
  display: none;
}
.better-mcp-autocomplete-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.better-mcp-autocomplete-option[data-active] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.better-mcp-autocomplete-label {
  font-size: 13px;
  line-height: 18px;
}
.better-mcp-autocomplete-detail,
.better-mcp-autocomplete-option code {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  overflow-wrap: anywhere;
}
.better-mcp-required {
  color: var(--dsw-alias-state-error-primary);
}
.better-mcp-field-hint {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  margin: 0;
  padding: 6px 12px;
  border: var(--dsh-hairline-width) solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  outline: none;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
select.better-mcp-input {
  padding-top: 0;
  padding-bottom: 0;
}
.better-mcp-input::placeholder {
  color: var(--dsw-alias-label-secondary);
  opacity: 1;
}
.better-mcp-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: inset 0 0 0 var(--dsh-hairline-width) var(--dsw-alias-state-business-primary);
}
.better-mcp-input[aria-invalid='true'] {
  border-color: var(--dsw-alias-state-error-primary);
}
.better-mcp-input:disabled {
  opacity: 0.55;
}
.better-mcp-textarea {
  min-height: 72px;
  resize: vertical;
}
.better-mcp-code {
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.better-mcp-checkbox {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.better-mcp-checkbox input {
  width: 16px;
  height: 16px;
  margin: 2px 0;
  accent-color: var(--dsw-alias-brand-primary);
}
.better-mcp-field-error,
.better-mcp-form-error {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.better-mcp-form-error {
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
}
@media (max-width: 720px) {
  .better-mcp-modal-root {
    padding: 12px;
  }
  .better-mcp-dialog-header {
    flex-wrap: wrap;
    padding: 16px 12px 12px 16px;
  }
  .better-mcp-dialog-actions {
    order: 3;
    width: 100%;
    margin-inline-start: 0;
    flex-wrap: wrap;
  }
  .better-mcp-dialog-body {
    padding: 0 16px 16px;
  }
  .better-mcp-dialog-footer {
    padding: 12px 16px 16px;
  }
  .better-mcp-server-line {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
  }
  .better-mcp-server-main {
    min-width: 0;
  }
  .better-mcp-server-side {
    width: 100%;
    justify-content: space-between;
    margin-left: 0;
  }
  .better-mcp-server-extra,
  .better-mcp-lazy-note {
    margin-left: 0;
  }
  .better-mcp-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .better-mcp-field-full {
    grid-column: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .better-mcp-switch-thumb {
    transition: none;
  }
}
`;
