/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export interface FoodImageResult {
  id: string;
  name: string;
  title: string;
  url: string;
  thumb: string;
  source: string;
}

interface TaggedCatalogItem {
  name: string;
  url: string;
  tags: string[];
}

const CURATED_IMAGE_CATALOG: TaggedCatalogItem[] = [
  // Burgers & Smash Burgers
  {
    name: 'برجر لحم سماش دبل تشيز',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=80',
    tags: ['برجر', 'سماش', 'همبرجر', 'لحم', 'تشيز', 'كلاسيك', 'burger', 'smash', 'cheeseburger', 'beef', 'كاب'],
  },
  {
    name: 'برجر دبل شيدر وصوص خاص',
    url: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=700&q=80',
    tags: ['برجر', 'دبل', 'تشيز', 'شيدر', 'لحم', 'burger', 'double', 'cheese'],
  },
  {
    name: 'برجر ترافل ومشروم فاخر',
    url: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=700&q=80',
    tags: ['برجر', 'ترافل', 'مشروم', 'فطر', 'سبيشال', 'burger', 'truffle', 'mushroom'],
  },
  {
    name: 'برجر باربكيو مدخن',
    url: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=700&q=80',
    tags: ['برجر', 'باربكيو', 'سموكي', 'مدخن', 'لحم', 'burger', 'bbq', 'smoky'],
  },
  {
    name: 'برجر دجاج كريسبي مقرمش',
    url: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=700&q=80',
    tags: ['برجر دجاج', 'دجاج', 'كرسبي', 'زنجر', 'مقرمش', 'ساندويش', 'chicken', 'crispy', 'zinger'],
  },
  {
    name: 'تشكن برجر بالجبن والخس',
    url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=700&q=80',
    tags: ['دجاج', 'برجر', 'فرايد', 'سبايسي', 'chicken', 'burger'],
  },
  {
    name: 'وجبة برجر كومبو مع بطاطا',
    url: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=700&q=80',
    tags: ['كومبو', 'وجبة', 'بوكس', 'برجر', 'combo', 'box', 'meal'],
  },
  {
    name: 'سلايدرز برجر ميني بوكس',
    url: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=700&q=80',
    tags: ['بوكس', 'عائلي', 'ميني', 'سلايدر', 'برجر', 'box', 'sliders', 'family'],
  },

  // Chicken Strips, Wings, Wraps & Shawarma
  {
    name: 'ستربس دجاج مقرمش ذهبي',
    url: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=700&q=80',
    tags: ['ستربس', 'دجاج', 'كرسبي', 'تندر', 'نجتس', 'بروستد', 'strips', 'tenders', 'fried chicken', 'nuggets'],
  },
  {
    name: 'أجنحة دجاج باربكيو وبافلو',
    url: 'https://images.unsplash.com/photo-1527477321055-43615b629c95?auto=format&fit=crop&w=700&q=80',
    tags: ['اجنحة', 'أجنحة', 'وينجز', 'دجاج', 'باربكيو', 'بافلو', 'wings', 'chicken'],
  },
  {
    name: 'راب دجاج وتورتيلا سبيشال',
    url: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=700&q=80',
    tags: ['راب', 'تورتيلا', 'فاهيتا', 'ساندويش', 'صاج', 'wrap', 'tortilla', 'sandwich'],
  },
  {
    name: 'شاورما عربي صاج طازج',
    url: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=700&q=80',
    tags: ['شاورما', 'كص', 'صاج', 'ساندويش', 'عربي', 'shawarma', 'kebab', 'wrap'],
  },

  // Fries & Appetizers
  {
    name: 'بطاطا فرايز مقرمشة',
    url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=700&q=80',
    tags: ['بطاطا', 'فرايز', 'فنگر', 'فنكر', 'مقرمشة', 'fries', 'potato'],
  },
  {
    name: 'بطاطا بالجبن الشيدر والهلابينو',
    url: '/uploads/hmo/item_046.jpg',
    tags: ['بطاطا', 'جبن', 'فرايز', 'شيدر', 'تشيكن فرايز', 'لوديد', 'cheese fries', 'loaded fries'],
  },
  {
    name: 'حلقات بصل مقرمشة ذهبية',
    url: 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=700&q=80',
    tags: ['بصل', 'حلقات', 'مقبلات', 'مقرمش', 'onion rings', 'appetizer'],
  },
  {
    name: 'أصابع موزاريلا مقرمشة',
    url: 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?auto=format&fit=crop&w=700&q=80',
    tags: ['موزاريلا', 'اصابع', 'أصابع', 'جبن', 'مقبلات', 'mozzarella', 'cheese sticks'],
  },
  {
    name: 'سلطة سيزر وخضروات طازجة',
    url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=700&q=80',
    tags: ['سلطة', 'سيزر', 'كولسلو', 'مقبلات', 'خضار', 'فتوش', 'تبولة', 'salad', 'coleslaw'],
  },
  {
    name: 'حمص بالطحينة وزيت الزيتون',
    url: 'https://images.unsplash.com/photo-1577906096429-f73c2c312435?auto=format&fit=crop&w=700&q=80',
    tags: ['حمص', 'متبل', 'مقبلات', 'شرقي', 'hummus', 'dip'],
  },

  // Sauces
  {
    name: 'صوصات متنوعة (ثومية / شيدر / ديناميت)',
    url: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=700&q=80',
    tags: ['صوص', 'صلصة', 'صوصات', 'ثومية', 'كاتشب', 'باربكيو', 'رانش', 'ديناميت', 'ترافل', 'sauce', 'dip', 'ketchup', 'mayo'],
  },
  {
    name: 'صوص جبن شيدر وكاب السري',
    url: 'https://images.unsplash.com/photo-1607532941433-304659e8198a?auto=format&fit=crop&w=700&q=80',
    tags: ['صوص', 'صلصة', 'شيدر', 'مايونيز', 'كولسلو', 'sauce', 'dressing'],
  },

  // Cold Drinks, Sodas, Mojito & Water
  {
    name: 'مشروب غازي كولا / بيبسي مثلج',
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=700&q=80',
    tags: ['بيبسي', 'كولا', 'كوكاكولا', 'غازي', 'مشروب', 'مشروبات', 'دايت', 'سفن', 'ميرندا', 'سبرايت', 'كانز', 'pepsi', 'cola', 'soda', 'soft drink'],
  },
  {
    name: 'مشروبات غازية باردة مع ثلج',
    url: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=700&q=80',
    tags: ['غازي', 'بيبسي', 'كولا', 'بارد', 'مشروب', 'سفن', 'ميرندا', 'soda', 'cola', 'pepsi', 'cold drink'],
  },
  {
    name: 'موهيتو ليمون ونعناع مثلج',
    url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=700&q=80',
    tags: ['موهيتو', 'عصير', 'ليمون', 'نعناع', 'بلوبيري', 'فراولة', 'مشروب', 'بارد', 'mojito', 'juice', 'cocktail'],
  },
  {
    name: 'عصائر طبيعية طازجة',
    url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=700&q=80',
    tags: ['عصير', 'برتقال', 'مانجو', 'فواكه', 'طبيعي', 'مشروبات', 'juice', 'fresh juice'],
  },
  {
    name: 'مياه معدنية باردة',
    url: 'https://images.unsplash.com/photo-1560023907-5f339617ea30?auto=format&fit=crop&w=700&q=80',
    tags: ['ماء', 'مياه', 'معدنية', 'قنينة', 'بارد', 'water', 'bottle'],
  },

  // Pizza (Dedicated variety for بيتزا queries)
  {
    name: 'بيتزا بيبروني وجبنة موزاريلا',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=700&q=80',
    tags: ['بيتزا', 'بيبروني', 'جبن', 'موزاريلا', 'pizza', 'pepperoni'],
  },
  {
    name: 'بيتزا إيطالية فرن حطب',
    url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=700&q=80',
    tags: ['بيتزا', 'سبيشال', 'بيبروني', 'pizza', 'wood fired'],
  },
  {
    name: 'بيتزا مارغريتا بالريحان والطماطم',
    url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=700&q=80',
    tags: ['بيتزا', 'مارغريتا', 'مرغريتا', 'نباتي', 'جبن', 'pizza', 'margherita'],
  },
  {
    name: 'بيتزا دجاج رانش وباربكيو',
    url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=80',
    tags: ['بيتزا', 'رانش', 'دجاج', 'باربكيو', 'خضار', 'pizza', 'chicken', 'ranch'],
  },
  {
    name: 'بيتزا أجبان أربعة وسوبريم',
    url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=700&q=80',
    tags: ['بيتزا', 'سوبريم', 'اجبان', 'أجبان', 'لحم', 'pizza', 'supreme', 'cheese'],
  },
  {
    name: 'بيتزا خضار وفطر وزيتون',
    url: 'https://images.unsplash.com/photo-1595854341625-f33ee10dbf94?auto=format&fit=crop&w=700&q=80',
    tags: ['بيتزا', 'خضار', 'فطر', 'مشروم', 'زيتون', 'pizza', 'veggie'],
  },

  // Grills, Rice & Coffee
  {
    name: 'مشاوي وكباب عراقي على الفحم',
    url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=700&q=80',
    tags: ['كباب', 'مشاوي', 'تكة', 'تكه', 'شيش', 'فحم', 'لحم', 'grill', 'kebab', 'bbq'],
  },
  {
    name: 'ريزو دجاج مع صوص خاص',
    url: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=700&q=80',
    tags: ['ريزو', 'رز', 'ارز', 'أرز', 'مندي', 'برياني', 'تمن', 'شرقي', 'rice', 'rizo'],
  },
  {
    name: 'قهوة لاتيه واسبريسو وكابتشينو',
    url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=700&q=80',
    tags: ['قهوة', 'لاتيه', 'اسبريسو', 'كابتشينو', 'امريكانو', 'موكا', 'ايس', 'كافيه', 'coffee', 'latte', 'espresso'],
  },
  {
    name: 'كريب ووافل وبان كيك بالشوكولاتة',
    url: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&w=700&q=80',
    tags: ['كريب', 'وافل', 'بان كيك', 'نوتيلا', 'شوكولاتة', 'حلويات', 'حلا', 'crepe', 'waffle', 'pancake', 'dessert'],
  },

  // Cakes, Pastries & Desserts (Dedicated variety for كيكة / كيك queries)
  {
    name: 'كيكة شوكولاتة غنية بالصوص',
    url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=80',
    tags: ['كيك', 'كيكة', 'كيكه', 'شوكولاتة', 'شوكلت', 'تورتة', 'تورته', 'حلا', 'حلويات', 'cake', 'chocolate cake'],
  },
  {
    name: 'تشيز كيك بالتوت والفراولة',
    url: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=700&q=80',
    tags: ['كيك', 'كيكة', 'كيكه', 'تشيز', 'فراولة', 'حلا', 'حلويات', 'cake', 'cheesecake', 'dessert'],
  },
  {
    name: 'كيك فانيلا بالكريمة والفواكه',
    url: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=700&q=80',
    tags: ['كيك', 'كيكة', 'كيكه', 'فانيلا', 'كريمة', 'فواكه', 'عيد ميلاد', 'تورتة', 'cake', 'cream cake'],
  },
  {
    name: 'كيك ريد فيلفيت وتورتة فاخرة',
    url: 'https://images.unsplash.com/photo-1616541823729-00fe0aacd32c?auto=format&fit=crop&w=700&q=80',
    tags: ['كيك', 'كيكة', 'كيكه', 'ريد فيلفيت', 'فيلفيت', 'تورتة', 'حلا', 'cake', 'red velvet'],
  },
  {
    name: 'تورتة احتفالات ومناسبات خاصة',
    url: 'https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=700&q=80',
    tags: ['كيك', 'كيكة', 'كيكه', 'تورتة', 'تورته', 'كعكة', 'كعك', 'عيد ميلاد', 'birthday cake', 'cake'],
  },
  {
    name: 'كب كيك وميني كيك مزين',
    url: 'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=700&q=80',
    tags: ['كيك', 'كيكة', 'كيكه', 'كب كيك', 'مافن', 'حلا', 'حلويات', 'cupcake', 'cake', 'muffin'],
  },
  {
    name: 'ميلك شيك وبوظة آيس كريم',
    url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=700&q=80',
    tags: ['ميلك شيك', 'شيك', 'ايس كريم', 'مثلجات', 'فراولة', 'اوريو', 'milkshake', 'shake', 'ice cream'],
  },

  // Store & General Business Products (For non-restaurant shops)
  {
    name: 'عطور فاخرة ومستحضرات تجميل',
    url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=700&q=80',
    tags: ['عطر', 'عطور', 'بخور', 'تجميل', 'مسك', 'perfume', 'fragrance'],
  },
  {
    name: 'زجاجة عطر فرنسي فاخرة',
    url: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=700&q=80',
    tags: ['عطر', 'عطور', 'برفان', 'عود', 'تجميل', 'perfume', 'cologne'],
  },
  {
    name: 'مستحضرات عناية بالبشرة ومكياج',
    url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80',
    tags: ['مكياج', 'تجميل', 'كريم', 'بشرة', 'روج', 'cosmetics', 'makeup', 'skincare'],
  },
  {
    name: 'ساعة يد ذكية وكلاسيك',
    url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=80',
    tags: ['ساعة', 'ساعات', 'ذكية', 'اكسسوار', 'watch', 'smartwatch'],
  },
  {
    name: 'ساعة يد كلاسيكية فخمة',
    url: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=700&q=80',
    tags: ['ساعة', 'ساعات', 'رجالي', 'اكسسوار', 'watch', 'luxury watch'],
  },
  {
    name: 'ملابس وأزياء عصرية',
    url: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=700&q=80',
    tags: ['ملابس', 'تيشيرت', 'قميص', 'ازياء', 'أزياء', 'بوتيك', 'clothes', 'shirt', 'fashion'],
  },
  {
    name: 'فستان وأزياء نسائية أنيقة',
    url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=700&q=80',
    tags: ['فستان', 'ملابس', 'نسائي', 'أزياء', 'بوتيك', 'dress', 'fashion'],
  },
  {
    name: 'أحذية رياضية وسنيكرز',
    url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=80',
    tags: ['حذاء', 'احذية', 'أحذية', 'سنيكرز', 'رياضي', 'shoes', 'sneakers'],
  },
  {
    name: 'حذاء رياضي أبيض مودرن',
    url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=700&q=80',
    tags: ['حذاء', 'احذية', 'سنيكرز', 'شوز', 'shoes', 'sneakers'],
  },
  {
    name: 'إلكترونيات وهواتف وسماعات',
    url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80',
    tags: ['سماعة', 'سماعات', 'الكترونيات', 'إلكترونيات', 'هاتف', 'موبايل', 'اجهزة', 'headphones', 'electronics'],
  },
  {
    name: 'هاتف ذكي واكسسوارات تقنية',
    url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=700&q=80',
    tags: ['هاتف', 'موبايل', 'ايفون', 'جوال', 'تقنية', 'phone', 'smartphone', 'mobile'],
  },
  {
    name: 'باقة ورد وهدايا أنيقة',
    url: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=700&q=80',
    tags: ['ورد', 'ورود', 'هدية', 'هدايا', 'باقة', 'زهور', 'flowers', 'gift'],
  },
  {
    name: 'بوكس هدايا وورد طبيعي',
    url: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=700&q=80',
    tags: ['هدية', 'هدايا', 'بوكس', 'ورد', 'مناسبات', 'gift', 'present'],
  },

  // Grills, Iraqi & Oriental Dishes, Pasta, Seafood, Breakfast, Sweets & Coffee Variety
  {
    name: 'كباب مشوي على الفحم مع خبز',
    url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=700&q=80',
    tags: ['كباب', 'مشاوي', 'لحم', 'ريش', 'شوي', 'ستيك', 'grill', 'kebab', 'steak'],
  },
  {
    name: 'شيش طاووق وتكة دجاج مشوية',
    url: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=700&q=80',
    tags: ['شيش', 'تكة', 'تكه', 'طاووق', 'دجاج', 'مشاوي', 'كباب', 'kebab', 'skewer', 'chicken'],
  },
  {
    name: 'شاورما لحم ودجاج عربي',
    url: 'https://images.unsplash.com/photo-1561651823-34feb02250e4?auto=format&fit=crop&w=700&q=80',
    tags: ['شاورما', 'كص', 'صاج', 'فلافل', 'ساندويش', 'shawarma', 'doner', 'wrap'],
  },
  {
    name: 'دجاج بروستد ومقلي مقرمش',
    url: 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?auto=format&fit=crop&w=700&q=80',
    tags: ['بروستد', 'دجاج', 'كنتاكي', 'مقرمش', 'فرايد', 'وجبة', 'fried chicken', 'broast'],
  },
  {
    name: 'برياني ومندي وكبسة دجاج',
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=700&q=80',
    tags: ['برياني', 'مندي', 'كبسة', 'قوزي', 'رز', 'تمن', 'دجاج', 'لحم', 'biryani', 'rice', 'mandi'],
  },
  {
    name: 'باستا ومعكرونة بصوص ألفريدو والطماطم',
    url: 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=700&q=80',
    tags: ['باستا', 'معكرونة', 'سباغيتي', 'فيتوتشيني', 'بيني', 'ايطالي', 'pasta', 'spaghetti', 'alfredo'],
  },
  {
    name: 'سمك مشوي ومأكولات بحرية',
    url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=700&q=80',
    tags: ['سمك', 'مسقوف', 'بحرية', 'روبيان', 'جمبري', 'سلمون', 'fish', 'seafood', 'salmon'],
  },
  {
    name: 'فطور صباحي وكروسان وبيض',
    url: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=700&q=80',
    tags: ['فطور', 'ريوك', 'ريوق', 'صباحي', 'بيض', 'كروسان', 'معجنات', 'breakfast', 'brunch'],
  },
  {
    name: 'ايس لاتيه وقهوة مثلجة',
    url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=700&q=80',
    tags: ['ايس', 'لاتيه', 'قهوة', 'سبانش', 'كافيه', 'بارد', 'iced coffee', 'latte', 'cold brew'],
  },
  {
    name: 'كابتشينو وإسبريسو طازج',
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=700&q=80',
    tags: ['قهوة', 'اسبريسو', 'امريكانو', 'كابتشينو', 'موكا', 'شاي', 'coffee', 'espresso'],
  },
  {
    name: 'كنافة وبقلاوة وحلويات شرقية',
    url: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&w=700&q=80',
    tags: ['كنافة', 'بقلاوة', 'شرقية', 'حلويات', 'حلا', 'نوتيلا', 'kunafa', 'baklava', 'sweets'],
  },
  {
    name: 'دونات وشوكولاتة محشوة',
    url: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=700&q=80',
    tags: ['دونات', 'حلوي', 'حلويات', 'حلا', 'كيك', 'شوكولاتة', 'donut', 'donuts', 'dessert'],
  },
  {
    name: 'عصير مانجو وفراولة طبيعي',
    url: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=700&q=80',
    tags: ['عصير', 'سموثي', 'فراولة', 'مانجو', 'فواكه', 'طبيعي', 'juice', 'smoothie'],
  },
  {
    name: 'منتجات بقالة وسوبرماركت طازجة',
    url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=700&q=80',
    tags: ['سوبرماركت', 'بقالة', 'خضروات', 'فواكه', 'مواد غذائية', 'متجر', 'grocery', 'supermarket'],
  },
];

function normAr(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

const AR_TO_EN_DICT: Array<[RegExp, string]> = [
  [/بيبسي|كولا|كوكاكولا/i, 'pepsi cola soda'],
  [/سفن|سبرايت|ميرندا|فانتا/i, 'soda cold drink'],
  [/موهيتو/i, 'mojito drink'],
  [/عصير|سموثي|برتقال|مانجو/i, 'fresh juice smoothie'],
  [/ماء|مياه/i, 'water bottle'],
  [/سماش|برجر|همبرجر|تشيز برجر/i, 'cheeseburger burger'],
  [/بروستد|كرسبي|زنجر|تندر|ستربس/i, 'fried chicken crispy'],
  [/اجنحة|أجنحة|وينجز/i, 'chicken wings'],
  [/بطاطا|فرايز|فنكر|فنگر/i, 'french fries'],
  [/صوص|صلصة|ثومية|كاتشب|مايونيز/i, 'dipping sauce'],
  [/بيتزا|بيبروني|مارغريتا|مرغريتا/i, 'pepperoni pizza'],
  [/شاورما|كص|صاج/i, 'shawarma wrap'],
  [/كباب|تكة|تكه|مشاوي|شيش/i, 'kebab grill meat'],
  [/ريزو|رز|ارز|تمن|برياني|مندي|كبسة/i, 'biryani chicken rice'],
  [/باستا|معكرونة|سباغيتي|فيتوتشيني/i, 'pasta spaghetti'],
  [/سمك|مسقوف|روبيان|جمبري/i, 'grilled fish seafood'],
  [/فطور|ريوك|ريوق|كروسان/i, 'breakfast croissant'],
  [/راب|تورتيلا|فاهيتا|ساندويش/i, 'sandwich wrap'],
  [/حلقات بصل/i, 'onion rings'],
  [/موزاريلا/i, 'mozzarella sticks'],
  [/سلطة|كولسلو|فتوش|تبولة/i, 'salad bowl'],
  [/حمص/i, 'hummus dish'],
  [/قهوة|لاتيه|اسبريسو|كابتشينو|موكا|ايس/i, 'latte coffee cup'],
  [/كريب|وافل|بان كيك|كنافة|بقلاوة|دونات/i, 'waffle dessert pastry'],
  [/كيكة|كيكه|كيك|تشيز كيك|تورتة|تورته|كعك|حلا|حلويات/i, 'chocolate cake dessert'],
  [/ميلك شيك|ايس كريم/i, 'milkshake ice cream'],
  [/بوكس|وجبة|كومبو/i, 'burger fries meal'],
  [/عطر|عطور|عود/i, 'perfume bottle'],
  [/مكياج|تجميل|بشرة/i, 'cosmetics makeup'],
  [/ساعة|ساعات/i, 'wristwatch'],
  [/ملابس|قميص|تيشيرت|بوتيك|فستان/i, 'fashion apparel'],
  [/حذاء|احذية|سنيكرز/i, 'sneakers shoe'],
  [/سماعة|الكترونيات|هاتف|موبايل/i, 'headphones smartphone'],
  [/ورد|ورود|هدية|هدايا/i, 'flower bouquet'],
  [/سوبرماركت|بقالة/i, 'fresh grocery produce'],
];

function translateArabicToEnglishQuery(rawQuery: string): string {
  const norm = normAr(rawQuery);
  const matched: string[] = [];
  for (const [regex, enTerm] of AR_TO_EN_DICT) {
    if (regex.test(rawQuery) || regex.test(norm)) {
      matched.push(enTerm);
    }
  }
  if (matched.length > 0) {
    return matched.slice(0, 2).join(' ');
  }
  return rawQuery;
}

async function fetchWikimediaImages(
  searchTerm: string,
  limit: number,
  offset = 0
): Promise<FoodImageResult[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const safeOffset = Math.max(0, Math.min(80, Math.floor(offset)));
    const fetchLimit = Math.min(24, limit + 10);
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      searchTerm
    )}&gsrlimit=${fetchLimit}&gsroffset=${safeOffset}&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=640&format=json`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MenuPlusApp/1.0 (https://menuplus.app)',
        Accept: 'application/json',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            pageid: number;
            title?: string;
            imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string; width?: number; height?: number }>;
          }
        >;
      };
    };

    const pages = Object.values(data.query?.pages || {});
    const kwTokens = searchTerm
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3);
    const results: FoodImageResult[] = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const mime = String(info?.mime || '').toLowerCase();
      const chosenUrl = info?.thumburl || info?.url;
      if (!chosenUrl || (!mime.startsWith('image/jpeg') && !mime.startsWith('image/png') && !mime.startsWith('image/webp'))) continue;
      if ((info?.width && info.width < 200) || (info?.height && info.height < 160)) continue;
      const cleanTitle = (page.title || searchTerm).replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '');
      const titleLower = cleanTitle.toLowerCase();
      if (
        titleLower.includes('map') ||
        titleLower.includes('logo') ||
        titleLower.includes('diagram') ||
        titleLower.includes('flag') ||
        titleLower.includes('icon') ||
        titleLower.includes('chart') ||
        titleLower.includes('stamp') ||
        titleLower.includes('sign')
      ) {
        continue;
      }
      if (kwTokens.length > 0 && !kwTokens.some((tok) => titleLower.includes(tok))) {
        continue;
      }
      results.push({
        id: `wiki_${page.pageid}_${safeOffset}`,
        name: cleanTitle,
        title: cleanTitle,
        url: chosenUrl,
        thumb: chosenUrl,
        source: 'web',
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}

export async function searchWebImages(
  query: string,
  limit = 16,
  offset = 0,
  seed = 0,
  excludeUrls: string[] = []
): Promise<FoodImageResult[]> {
  const cleanQuery = String(query || '').trim();
  const qNorm = normAr(cleanQuery);
  const excludedSet = new Set(excludeUrls.map((u) => String(u || '').trim()).filter(Boolean));

  if (!cleanQuery) {
    const len = CURATED_IMAGE_CATALOG.length;
    const startIdx = len > 0 ? Math.abs(offset + seed * 4) % len : 0;
    const rotated = [...CURATED_IMAGE_CATALOG.slice(startIdx), ...CURATED_IMAGE_CATALOG.slice(0, startIdx)];
    const filtered = rotated.filter((it) => !excludedSet.has(it.url));
    const sourceList = filtered.length >= Math.min(limit, 4) ? filtered : rotated;
    return sourceList.slice(0, limit).map((it, idx) => ({
      id: `curated_${startIdx}_${idx}`,
      name: it.name,
      title: it.name,
      url: it.url,
      thumb: it.url,
      source: 'curated',
    }));
  }

  // Score every curated item using Arabic-normalized tokens (ة -> ه, ال strip, etc.)
  const rawTokens = qNorm.split(/[\s,،.\-/+]+/).filter((t) => t.length >= 2);
  const tokens = Array.from(
    new Set(rawTokens.flatMap((t) => (t.startsWith('ال') && t.length > 3 ? [t, t.slice(2)] : [t])))
  );

  const scored = CURATED_IMAGE_CATALOG.map((it, idx) => {
    let score = 0;
    const normTags = it.tags.map((tg) => normAr(tg));
    const normName = normAr(it.name);
    const haystack = `${normName} ${normTags.join(' ')}`;
    if (haystack.includes(qNorm)) score += 10;
    for (const tok of tokens) {
      if (normTags.some((tg) => tg === tok)) score += 9;
      else if (normTags.some((tg) => tg.includes(tok) || (tg.length >= 3 && tok.includes(tg)))) score += 5;
      else if (normName.includes(tok)) score += 3;
    }
    return { it, idx, score };
  })
    .filter((entry) => entry.score >= 5)
    .sort((a, b) => b.score - a.score);

  const curatedPool = scored.map((entry) => ({
    id: `curated_${entry.idx}`,
    name: entry.it.name,
    title: entry.it.name,
    url: entry.it.url,
    thumb: entry.it.url,
    source: 'curated',
  }));

  // Fetch relevant Wikimedia Commons results with pagination (`offset` / `seed`) so refresh gets genuinely fresh images
  const searchKeyword = translateArabicToEnglishQuery(cleanQuery);
  const wikiOffset = Math.max(0, offset + seed * 6);
  const neededWeb = Math.max(limit, 12);
  let webResults = await fetchWikimediaImages(searchKeyword, neededWeb, wikiOffset);
  if (webResults.length < 4 && wikiOffset > 0) {
    const extra = await fetchWikimediaImages(searchKeyword, neededWeb, 0);
    webResults = [...webResults, ...extra];
  }

  const unseenCurated = curatedPool.filter((r) => !excludedSet.has(r.url));
  const unseenWeb = webResults.filter((r) => !excludedSet.has(r.url));

  const seenUrls = new Set<string>();
  const combined: FoodImageResult[] = [];
  // Prefer unseen results first (and on refresh seed > 0 prioritize fresh web results when curated pool was already seen)
  const orderedCandidates =
    seed > 0 ? [...unseenCurated, ...unseenWeb, ...webResults, ...curatedPool] : [...curatedPool, ...unseenWeb, ...webResults];

  for (const r of orderedCandidates) {
    if (seed > 0 && excludedSet.has(r.url) && combined.length < limit) {
      continue;
    }
    if (!seenUrls.has(r.url)) {
      seenUrls.add(r.url);
      combined.push(r);
    }
    if (combined.length >= limit) break;
  }

  if (combined.length < Math.min(4, limit)) {
    for (const r of [...unseenCurated, ...unseenWeb, ...curatedPool, ...webResults]) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        combined.push(r);
      }
      if (combined.length >= limit) break;
    }
  }

  return combined.slice(0, limit);
}

const MAX_PROXY_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const PROXY_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // Link-local / Cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a >= 224) return true; // Multicast & Reserved
  return false;
}

function isPrivateIp(ip: string): boolean {
  const clean = ip.split('%')[0].trim().toLowerCase();
  const ver = net.isIP(clean);
  if (ver === 4) return isPrivateIpv4(clean);
  if (ver === 6) {
    if (clean === '::' || clean === '::1') return true;
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // ULA fc00::/7
    if (/^fe[89ab]/.test(clean)) return true; // Link-local fe80::/10
    if (clean.startsWith('ff')) return true; // Multicast
    const mappedV4 = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedV4) return isPrivateIpv4(mappedV4[1]);
    return false;
  }
  return true;
}

async function assertSafeExternalImageUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported URL protocol');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not allowed');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('Disallowed target host');
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Disallowed private IP address');
    return parsed;
  }

  const records = await dns.lookup(host, { all: true });
  if (!records || records.length === 0) {
    throw new Error('Host resolution failed');
  }
  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new Error('Resolved IP is in a restricted network');
    }
  }

  return parsed;
}

export async function proxyExternalImage(
  targetUrl: string
): Promise<{ status: number; contentType: string; buffer?: Buffer; error?: string }> {
  try {
    if (!targetUrl || typeof targetUrl !== 'string' || targetUrl.length > 2048) {
      return { status: 400, contentType: 'application/json', error: 'Invalid URL' };
    }

    let currentUrl = await assertSafeExternalImageUrl(targetUrl.trim());
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        headers: {
          'User-Agent': 'MenuPlusImageProxy/1.0',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) {
          return { status: 400, contentType: 'application/json', error: 'Redirect limit exceeded' };
        }
        const resolvedRedirect = new URL(location, currentUrl).toString();
        currentUrl = await assertSafeExternalImageUrl(resolvedRedirect);
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      return {
        status: response?.status || 502,
        contentType: 'application/json',
        error: `Failed to fetch image: ${response?.statusText || 'Upstream error'}`,
      };
    }

    const rawContentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (
      !rawContentType.startsWith('image/') ||
      rawContentType.includes('svg') ||
      rawContentType.includes('xml') ||
      rawContentType.includes('html')
    ) {
      return {
        status: 415,
        contentType: 'application/json',
        error: 'Unsupported image media type',
      };
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_PROXY_IMAGE_BYTES) {
      return {
        status: 413,
        contentType: 'application/json',
        error: 'Image exceeds maximum allowed size',
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PROXY_IMAGE_BYTES) {
      return {
        status: 413,
        contentType: 'application/json',
        error: 'Image exceeds maximum allowed size',
      };
    }

    const buffer = Buffer.from(arrayBuffer);

    return {
      status: 200,
      contentType: rawContentType,
      buffer,
    };
  } catch (err: any) {
    const msg = err?.message || 'Proxy error';
    const isClientError =
      msg.includes('Invalid URL') ||
      msg.includes('Disallowed') ||
      msg.includes('Unsupported') ||
      msg.includes('credentials') ||
      msg.includes('restricted');
    return {
      status: isClientError ? 400 : 502,
      contentType: 'application/json',
      error: msg,
    };
  }
}
