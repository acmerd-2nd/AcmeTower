export default {
  async fetch(request, env, ctx) {
    return new Response("Hello World!", {
      headers: { "content-type": "text/plain;charset=UTF-8" },
    });
  },
};
