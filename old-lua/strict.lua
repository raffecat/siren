-- strict.lua
--
-- checks uses of undeclared global variables
-- All global variables must be 'declared' through a regular assignment
-- (even assigning nil will do) in a main chunk before being used
-- anywhere or assigned to inside a function.
--

local mt = getmetatable(_G)
if mt == nil then
  mt = {}
  setmetatable(_G, mt)
end

__STRICT = true
mt.__declared = {}

mt.__newindex = function (t, n, v)
  if __STRICT and not mt.__declared[n] then
    local w = debug.getinfo(2, "S").what
    if w ~= "main" and w ~= "C" then
      error("assign to undeclared variable '"..n.."'", 2)
    end
    mt.__declared[n] = true
  end
  rawset(t, n, v)
end

mt.__index = function (t, n)
  if not mt.__declared[n] and debug.getinfo(2, "S").what ~= "C" then
    error("variable '"..n.."' is not declared", 2)
  end
  return rawget(t, n)
end

function global(...)
   for _, v in ipairs{...} do mt.__declared[v] = true end
end

-----[ new: detect missing attributes ]-----

function tos(t)
  if type(t)=='table' then
    local s='{ '; for tk,tv in pairs(t) do
      if type(tv)=='table' then s=s..tostring(tk)..'={...} '
      else s=s..tostring(tk)..'='..(type(tv)=='function' and '[fn]' or string.format('%q',tv))..' ' end
    end; return s..'}'
  else
    return "type '"..type(t).."' -> "..(type(t)=='function' and '[fn]' or string.format('%q',t))
  end
end

local new_mt = {
  __index = function(t,k)
    error((rawget(t,'is') or "new")..": missing attribute: '"..k.."' in "..tos(t))
  end
}
function new(obj)
  setmetatable(obj, new_mt)
  return obj
end

-----[ type assertions ]-----

function str(v) if type(v)~='string' then error("expecting a string, got "..tos(v)) else return v end end
function num(v) if type(v)~='number' then error("expecting a number, got "..tos(v)) else return v end end
function tab(v) if type(v)~='table' then error("expecting a table, got "..tos(v)) else return v end end
function bool(v) if type(v)~='boolean' then error("expecting a boolean, got "..tos(v)) else return v end end
function func(v) if type(v)~='function' then error("expecting a function, got "..tos(v)) else return v end end

-----[ list helper ]-----

function List() local s={n=0} function s.add(v) local n=s.n+1; s.n=n; s[n]=v end return s end
