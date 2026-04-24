import { c as create_ssr_component, e as escape } from "../../chunks/ssr.js";
const css = {
  code: ".err-wrap.svelte-16w3bl4.svelte-16w3bl4{padding:2rem;font-family:system-ui, sans-serif;max-width:640px;margin:0 auto}h1.svelte-16w3bl4.svelte-16w3bl4{font-size:2rem;color:#b91c1c;margin:0 0 0.5rem}.msg.svelte-16w3bl4.svelte-16w3bl4{color:#444;line-height:1.6}.stk.svelte-16w3bl4.svelte-16w3bl4{margin-top:1rem;padding:1rem;background:#f4f4f0;border-radius:8px;overflow:auto;font-size:11px}.hint.svelte-16w3bl4.svelte-16w3bl4{margin-top:1.5rem;font-size:14px}.hint.svelte-16w3bl4 a.svelte-16w3bl4{color:#6b4ef6}",
  map: `{"version":3,"file":"+error.svelte","sources":["+error.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { dev } from \\"$app/environment\\";\\nexport let data = {};\\nexport let params = {};\\nexport let error;\\nexport let status;\\n<\/script>\\n\\n<span hidden>{JSON.stringify(data)}{JSON.stringify(params)}</span>\\n\\n<div class=\\"err-wrap\\">\\n  <h1>{status}</h1>\\n  <p class=\\"msg\\">{error?.message ?? '오류가 발생했어.'}</p>\\n  {#if dev && error?.stack}\\n    <pre class=\\"stk\\">{error.stack}</pre>\\n  {/if}\\n  <p class=\\"hint\\"><a href=\\"/\\">처음으로</a></p>\\n</div>\\n\\n<style>\\n  .err-wrap {\\n    padding: 2rem;\\n    font-family: system-ui, sans-serif;\\n    max-width: 640px;\\n    margin: 0 auto;\\n  }\\n  h1 {\\n    font-size: 2rem;\\n    color: #b91c1c;\\n    margin: 0 0 0.5rem;\\n  }\\n  .msg {\\n    color: #444;\\n    line-height: 1.6;\\n  }\\n  .stk {\\n    margin-top: 1rem;\\n    padding: 1rem;\\n    background: #f4f4f0;\\n    border-radius: 8px;\\n    overflow: auto;\\n    font-size: 11px;\\n  }\\n  .hint {\\n    margin-top: 1.5rem;\\n    font-size: 14px;\\n  }\\n  .hint a {\\n    color: #6b4ef6;\\n  }\\n</style>\\n"],"names":[],"mappings":"AAmBE,uCAAU,CACR,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,SAAS,CAAC,CAAC,UAAU,CAClC,SAAS,CAAE,KAAK,CAChB,MAAM,CAAE,CAAC,CAAC,IACZ,CACA,gCAAG,CACD,SAAS,CAAE,IAAI,CACf,KAAK,CAAE,OAAO,CACd,MAAM,CAAE,CAAC,CAAC,CAAC,CAAC,MACd,CACA,kCAAK,CACH,KAAK,CAAE,IAAI,CACX,WAAW,CAAE,GACf,CACA,kCAAK,CACH,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,IAAI,CACb,UAAU,CAAE,OAAO,CACnB,aAAa,CAAE,GAAG,CAClB,QAAQ,CAAE,IAAI,CACd,SAAS,CAAE,IACb,CACA,mCAAM,CACJ,UAAU,CAAE,MAAM,CAClB,SAAS,CAAE,IACb,CACA,oBAAK,CAAC,gBAAE,CACN,KAAK,CAAE,OACT"}`
};
const Error = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { data = {} } = $$props;
  let { params = {} } = $$props;
  let { error } = $$props;
  let { status } = $$props;
  if ($$props.data === void 0 && $$bindings.data && data !== void 0) $$bindings.data(data);
  if ($$props.params === void 0 && $$bindings.params && params !== void 0) $$bindings.params(params);
  if ($$props.error === void 0 && $$bindings.error && error !== void 0) $$bindings.error(error);
  if ($$props.status === void 0 && $$bindings.status && status !== void 0) $$bindings.status(status);
  $$result.css.add(css);
  return `<span hidden>${escape(JSON.stringify(data))}${escape(JSON.stringify(params))}</span> <div class="err-wrap svelte-16w3bl4"><h1 class="svelte-16w3bl4">${escape(status)}</h1> <p class="msg svelte-16w3bl4">${escape(error?.message ?? "오류가 발생했어.")}</p> ${``} <p class="hint svelte-16w3bl4" data-svelte-h="svelte-1721mhm"><a href="/" class="svelte-16w3bl4">처음으로</a></p> </div>`;
});
export {
  Error as default
};
