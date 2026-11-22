import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { AuthSettings } from "../src/services/api/auth";

const dom = new Window({ url: "https://phone-auth.test/register" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key,value] of Object.entries({
    window:dom,document:dom.document,navigator:dom.navigator,location:dom.location,
    HTMLElement:dom.HTMLElement,HTMLInputElement:dom.HTMLInputElement,SVGElement:dom.SVGElement,
    HTMLAnchorElement:dom.HTMLAnchorElement,HTMLBodyElement:dom.HTMLBodyElement,HTMLHtmlElement:dom.HTMLHtmlElement,
    HTMLButtonElement:dom.HTMLButtonElement,Element:dom.Element,Node:dom.Node,ShadowRoot:dom.ShadowRoot,
    MutationObserver:dom.MutationObserver,ResizeObserver:dom.ResizeObserver,
    getComputedStyle:dom.getComputedStyle.bind(dom),requestAnimationFrame:dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame:dom.cancelAnimationFrame.bind(dom),IS_REACT_ACT_ENVIRONMENT:true,
})) {
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
}
const {act}=await import("react");
const {createRoot}=await import("react-dom/client");
const {App,ConfigProvider}=await import("antd");
const {I18nextProvider}=await import("react-i18next");
const {i18n}=await import("../src/i18n");
const {http}=await import("../src/services/api/request");
const {AuthLoginForm}=await import("../src/components/auth/auth-login-form");
const {AuthRegisterForm}=await import("../src/components/auth/auth-register-form");
const post=spyOn(http,"post");
const settings:AuthSettings={
    firstUser:false,registrationEnabled:true,linuxdoEnabled:false,googleEnabled:false,githubEnabled:false,
    emailEnabled:false,emailCodeRequired:false,smsBindingAvailable:true,emailBindingAvailable:false,loginMode:"modal",
    smsLogin:true,emailLogin:false,smsRegistration:true,emailRegistration:false,smsAndEmailRegistration:false,emailRequired:false,
};
let root:ReturnType<typeof createRoot>|undefined;
let host:HTMLDivElement;
const settle=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});};
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(el=>el.textContent?.replace(/\s/g,"")===label.replace(/\s/g,""))!;
async function fill(label:string,value:string){
    const input=document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(input).toBeTruthy();
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new dom.Event("input",{bubbles:true}));});
}
async function render(overrides:Partial<AuthSettings>={}, view:"register"|"login"="register"){
    const Form=view==="register"?AuthRegisterForm:AuthLoginForm;
    host=document.createElement("div");document.body.append(host);root=createRoot(host);
    await act(async()=>root!.render(<ConfigProvider theme={{token:{motion:false}}}><App><I18nextProvider i18n={i18n}>
        <Form settings={{...settings,...overrides}} settingsFailed={false} onReloadSettings={()=>{}} next="/home" onAuthenticated={()=>{}} onViewChange={()=>{}} />
    </I18nextProvider></App></ConfigProvider>));
    await settle();
}
beforeEach(()=>{
    post.mockImplementation(async(path)=>{
        if(path==="/auth/verification")return {ticket:"test-ticket",expiresIn:600,retryAfter:60};
        throw new Error("stop after inspecting the authentication request");
    });
});
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;host?.remove();post.mockReset();});
afterAll(()=>{post.mockRestore();dom.happyDOM.abort();for(const[key,value]of originals){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}});

test("registration has its own account, password and phone verification form",async()=>{
    await render();
    expect(document.querySelectorAll('input[type="password"]').length).toBe(2);
    expect(document.querySelector('input[autocomplete="username"]')).toBeTruthy();
    expect(button("创建账号").disabled).toBe(true);
    expect(document.body.textContent).not.toContain("登录 / 注册");
    await fill("用户名","film-maker");
    await fill("密码","test-password-42");
    await fill("确认密码","test-password-42");
    await fill("手机号","13800138000");
    await act(async()=>button("获取验证码").click());await settle();
    expect(post.mock.calls[0]?.[0]).toBe("/auth/verification");
    expect(post.mock.calls[0]?.[1]).toMatchObject({purpose:"register",method:"sms",phone:"13800138000"});
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("autoRegister");
    await fill("短信验证码","123456");
    await act(async()=>document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async()=>document.querySelector("form")!.dispatchEvent(new dom.Event("submit",{bubbles:true,cancelable:true})));await settle();
    expect(post.mock.calls[1]?.[0]).toBe("/auth/register");
    const payload=post.mock.calls[1]?.[1] as Record<string,unknown>;
    expect(payload).toMatchObject({username:"film-maker",password:"test-password-42",phone:"13800138000",ticket:"test-ticket",smsCode:"123456",acceptedTerms:true});
    expect(payload).not.toHaveProperty("autoRegister");
});
test("login defaults to account or phone plus password and never registers",async()=>{
    await render({},"login");
    expect(button("登录")).toBeTruthy();
    expect(button("立即注册")).toBeTruthy();
    expect(document.querySelector('input[autocomplete="new-password"]')).toBeNull();
    await fill("账号 / 手机号 / 邮箱","13800138000");await fill("密码","test-password-42");
    await act(async()=>document.querySelector("form")!.dispatchEvent(new dom.Event("submit",{bubbles:true,cancelable:true})));await settle();
    expect(post.mock.calls[0]).toEqual(["/auth/login",{username:"13800138000",password:"test-password-42"}]);
    expect(document.body.textContent).not.toContain("登录 / 注册");
});
test("registration closure retains existing SMS login without asking for signup",async()=>{
    await render({registrationEnabled:false},"login");
    await act(async()=>button("手机号登录").click());
    await fill("手机号","13800138000");
    await act(async()=>button("获取验证码").click());await settle();
    expect(post.mock.calls[0]?.[1]).not.toHaveProperty("autoRegister");
    expect(button("登录")).toBeTruthy();
});
test("registration closed or verification unavailable cannot submit",async()=>{
    await render({registrationEnabled:false});
    expect(button("创建账号").disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[autocomplete="username"]')!.disabled).toBe(true);
});
test("SMS registration remains mandatory when optional email verification is disabled",async()=>{
    await render({emailVerificationRequired:false});
    expect(document.querySelector('input[aria-label="手机号"]')).toBeTruthy();
    expect(button("创建账号").disabled).toBe(true);
});
test("registration refuses mismatched passwords without sending a registration request",async()=>{
    await render();await fill("用户名","film-maker");await fill("密码","test-password-42");await fill("确认密码","another-password");
    await act(async()=>document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async()=>document.querySelector("form")!.dispatchEvent(new dom.Event("submit",{bubbles:true,cancelable:true})));await settle();
    expect(post.mock.calls).toHaveLength(0);
});
