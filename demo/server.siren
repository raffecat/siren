--dev server

server port 8000 is
  post "/api/{path*}" is
    max-age 0
    proxy "http://localhost:4002/api/{path}"
  end
  get "/" is
    max-age 0
    static "web/index.html"
  end
  get "/privatepolicy.html" is
    redirect "/privacypolicy" with 301
  end
  get default is
    max-age 0
    auto-ext ".html"
    static "web/{path}"
  end
end

-- blah blah words

postgres db "postgres://postgres:p4ss@localhost/beaverstail"
server port 4002 is
  use json-parser
  use url-decoder
  import './services/lunch_order' with db
  import './services/bulk_order' with db
  import './services/pay_forward' with db
  import './services/contact_us' with db
  import './services/paypal' with db
end

-- service lunch-order

import moment
import paypal

let minOrder = 200 -- cents.
let cutoffHours = 9 -- 9 am.
let closedHours = 5 -- 9 am + 5 hr -> 2 pm.
let expireMins = 5 -- + 5 minutes

service with db is
  db.ensure-collection orders
  db.ensure-index bookDate on orders
  router is

    post '/api/begin' is
      calc-book-date as now, bookDate, expires, closed
      db.insert-token orders with type='lunch', status='new', startTime=now, bookDate=bookDate, expires=expires as token
      day-date-names now as dayName, dateText
      with expires diff-from now as expiresIn -- milliseconds.
      reply-json { token=token, bookDate=dateText, dayName=dayName, expiresIn=expiresIn, closed=closed }
    end

    post '/api/submit' is
      parse-json body with submit-schema as order
      calc-total order as total, items
      if total < minOrder do
        reply-json { error='toosmall', 'total'=total }
        stop
      end
      moment.now as now
      db.update-one orders with order.token is
        where expires > now and total = null -- has no total yet.
        update status='placed', school=order.school, group=order.group,
               first=(order.first trim), last=(order.last trim), phone=(order.phone trim),
               size=order.size, main=order.main, salad=order.salad, roll=order.roll,
               sushi=order.sushi, snack=order.snack, allergy=order.allergy,
               items=items, total=total, submitTime=now
      when did-update do
        finish-order items, order -- order was saved, now pay.
      when did-find with obj do
        finish-order obj.items, order -- order already has a total; use its items to pay.
      when no-match do
        reply-json { error='expired' }
      end
    end

  end
end

command finish-order inline with items, order is
  paypal.create-invoice order.token as res with `
      items=items, desc="Beavers Tail Lunch Order", support="1300 287 785", currency="AUD", country="AU",
      note="{order.phone}, {order.school}, {order.group}, {order.first} {order.last}, {order.allergy}"
  reply-json { paid=res.paid, url=res.url }
end

schema submit-schema is
  string token   max 100
  string school  max 100
  string group   max 100
  string first   max 50
  string last    max 50
  string phone   max 20
  string allergy max 200
  string size    mapping size-options
  string main    mapping main-options
  string snack   mapping snack-options
  object salad   mapping salad-options
  object roll    mapping roll-options
  object sushi   mapping sushi-options
end

mapping size-options is
  "small" => cost 400 name "Small"
  "large" => cost 500 name "Large"
  "gf"    => cost 600 name "GF"
end

mapping main-options is
  "mountain"        => name "Mountain Sandwich"
  "atlantic"        => name "Atlantic Sandwich"
  "tuna"            => name "Tuna Sandwich"
  "vegetarian"      => name "Vegetarian Sandwich"
  "ham-cheese"      => name "Ham Cheese Sandwich"
  "caesar"          => name "Caesar Sandwich"
  "vegemite-cheese" => name "Vegemite Cheese Sandwich"
  "chicken-snitzel" => name "Chicken Schnitzel Sandwich"
  "jelly"           => name "Jelly Sandwich"
  "none"            => name "No sandwich"
end

mapping snack-options is
  "blueberry-choc"  => cost 250 name "Blueberry Choc Muffin"
  "cookie"          => cost 250 name "Chocolate Cookie"
  "none"            => cost 0   name "No snack"
end

mapping salad-options is
  mapping "brainy" is
    "one"     => cost 500 name "1 Brainy Box"
    "none"    => cost 0   name "None"
  end
  mapping "fruit" is
    "one"     => cost 600 name "1 Fruit Salad"
    "none"    => cost 0   name "None"
  end
end

mapping roll-options is
  mapping "pork" is
    "one"     => cost 450 name "1 Superfamous Roll"
    "two"     => cost 900 name "2 Superfamous Rolls"
    "none"    => cost 0   name "None"
  end
  mapping "spinach" is
    "one"     => cost 450 name "1 Spinach Ricotta Roll"
    "two"     => cost 900 name "2 Spinach Ricotta Rolls"
    "none"    => cost 0   name "None"
  end
  mapping "beef" is
    "one"     => cost 450 name "1 Humble Beef Roll"
    "two"     => cost 900 name "2 Humble Beef Rolls"
    "none"    => cost 0   name "None"
  end
  mapping "pie" is
    "one"     => cost 300 name "1 Classic Party Pie"
    "two"     => cost 600 name "2 Classic Party Pies"
    "three"   => cost 900 name "3 Classic Party Pies"
    "none"    => cost 0   name "None"
  end
end

mapping sushi-options is
  mapping "tuna_avo" is
    "one-tuna-avo"     => cost 250 name "1 Tuna Avocado Sushi"
    "two-tuna-avo"     => cost 500 name "2 Tuna Avocado Sushi"
    "three-tuna-avo"   => cost 750 name "3 Tuna Avocado Sushi"
    "none"             => cost 0   name "None"
  end
  mapping "avo_cuc" is
    "one-avo-cuc"      => cost 250 name "1 Avocado Cucumber Sushi"
    "two-avo-cuc"      => cost 500 name "2 Avocado Cucumber Sushi"
    "three-avo-cuc"    => cost 750 name "3 Avocado Cucumber Sushi"
    "none"             => cost 0   name "None"
  end
  mapping "chic_teri" is
    "one-chic-teri"    => cost 250 name "1 Chicken Teriyaki Sushi"
    "two-chic-teri"    => cost 500 name "2 Chicken Teriyaki Sushi"
    "three-chic-teri"  => cost 750 name "3 Chicken Teriyaki Sushi"
    "none"             => cost 0   name "None"
  end
  mapping "tuna_lett" is
    "one-tuna-lett"    => cost 250 name "1 Tuna Lettuce Sushi"
    "two-tuna-lett"    => cost 500 name "2 Tuna Lettuce Sushi"
    "three-tuna-lett"  => cost 750 name "3 Tuna Lettuce Sushi"
    "none"             => cost 0   name "None"
  end
  mapping "vegetable" is
    "one-vegetable"    => cost 250 name "1 Vegetable Sushi"
    "two-vegetable"    => cost 500 name "2 Vegetable Sushi"
    "three-vegetable"  => cost 750 name "3 Vegetable Sushi"
    "none"             => cost 0   name "None"
  end
  mapping "salmon" is
    "one-salmon"       => cost 250 name "1 Smoked Salmon Sushi"
    "two-salmon"       => cost 500 name "2 Smoked Salmon Sushi"
    "three-salmon"     => cost 750 name "3 Smoked Salmon Sushi"
    "none"             => cost 0   name "None"
  end
end

command calc-book-date is
  moment.now as now
  let start = now start-of week -- Sunday at midnight.
  let days = [ 1, 2, 3, 4, 5,  8 ] -- Mon, Tue, Wed, Thurs, Fri, Mon.
  let cutoffs = days map d | start add-days d add-hours cutoffHours
  let cutoff = cutoffs first c | c > now else start -- first cutoff after now (will always find one)
  let prev-cutoff = cutoff subtract-days 1 -- yesterday's cutoff.
  let end-of-closed = prev-cutoff add-hours closedHours -- end of previous "closed" time.
  let closed = now < end-of-closed and end-of-closed > start add-days 1 -- on Mon or later.
  let bookDate = cutoff start-of day
  let expires = cutoff add-minutes expireMins
  yields now, bookDate, expires, closed
end

command day-date-names with now is
  let today = now start-of day
  let tomorrow = today add-days 1
  map bookDate as dayName with
    today    => 'Today'
    tomorrow => 'Tomorrow'
    => bookDate format "dddd"
  end
  map bookDate as dateName with
    today    => bookDate format "dddd Do of MMMM"
    tomorrow => bookDate format "dddd Do of MMMM"
    => bookDate format "Do of MMMM"
  end
  yields dayName, dateName
end
