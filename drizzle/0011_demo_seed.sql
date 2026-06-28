-- Demo seed: full snapshot of demo data (idempotent via INSERT OR IGNORE)
INSERT OR IGNORE INTO households VALUES(1,'CurlHome',1782672446);
--> statement-breakpoint
INSERT OR IGNORE INTO households VALUES(2,'LoopHome',1782672506);
--> statement-breakpoint
INSERT OR IGNORE INTO households VALUES(3,'My Household',1782675565);
--> statement-breakpoint
INSERT OR IGNORE INTO households VALUES(4,'The Krishnappa Kitchen',1782675697);
--> statement-breakpoint
INSERT OR IGNORE INTO households VALUES(5,'The Krishnappa Kitchen',1782688034);
--> statement-breakpoint
INSERT OR IGNORE INTO households VALUES(6,'Home',1782688141);
--> statement-breakpoint
INSERT OR IGNORE INTO households VALUES(7,'The Krishnappa Kitchen',1782688349);
--> statement-breakpoint
INSERT OR IGNORE INTO households VALUES(8,'Demo Household',0);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(1,1,'curl@test.com','$2b$10$SYRlhtqybNpDhWClHQXOkuHb48JT/EUVZ7q.8hUD1azCSRRADpYvW',NULL,1782672446);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(2,2,'loop@test.com','$2b$10$l4MUOFlxyDXx28CemVjmceCdMW09ulNPXbFo5vXjkmuyvN19eiv6O',NULL,1782672506);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(3,3,'abhishekr0@protonmail.com','$2b$10$TVsXu7na/P0neDUUcwoWnOFw7mZT.JI7FPqgMAkj88j30H4lLQSw.',NULL,1782675565);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(4,4,'demo1782675694009@mealpal.test','$2b$10$M.mT7ARoBrVAaHP7GoyV3uIWh6TZKIyBQuVXqc3KCHn5Q56hDFRDC',NULL,1782675697);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(5,5,'demo1782688033438@mealpal.test','$2b$10$9R4mHipBkGImJxnn5iAaH.dScji7G9K1HJJ85bgxf9sk1kMXH0x4e',NULL,1782688034);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(6,6,'d1782688141225@m.test','$2b$10$qINHnq2AUSirZNkW/B25..B5jzsatOlbo70o/OUnZ160LcyPVecIG',NULL,1782688141);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(7,7,'d1782688348479@m.test','$2b$10$fG0TC.RjlqHiritkfK8.bOT6nBhpmiAIBXYqIGd9td4wjkICu7dyq',NULL,1782688349);
--> statement-breakpoint
INSERT OR IGNORE INTO users VALUES(8,8,'demo@demo.com','$2b$10$0h3tN.V/NToZSyeT5LjU.eKcWa/E/64Xzi45Jy36n0TfxYrfb3BAq','Demo',0);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(1,4,'All-purpose flour','g',50,1782675699);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(2,4,'Whole milk','ml',240,1782675699);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(3,4,'Eggs','count',1,1782675699);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(4,4,'Butter','g',14,1782675699);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(6,4,'Milk','ml',NULL,1782677682);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(7,5,'All-purpose flour','g',50,1782688037);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(8,5,'Whole milk','ml',240,1782688037);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(9,5,'Eggs','count',1,1782688037);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(10,5,'Butter','g',14,1782688037);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(11,6,'Flour','g',50,1782688143);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(12,7,'All-purpose flour','g',50,1782688351);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(13,7,'Whole milk','ml',240,1782688351);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(14,7,'Eggs','count',1,1782688351);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(15,7,'Butter','g',14,1782688351);
--> statement-breakpoint
INSERT OR IGNORE INTO ingredients VALUES(16,8,'Milk','ml',NULL,1782690048);
--> statement-breakpoint
INSERT OR IGNORE INTO prices VALUES(1,1,1299,1782675700);
--> statement-breakpoint
INSERT OR IGNORE INTO prices VALUES(2,2,449,1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO prices VALUES(3,3,679,1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO prices VALUES(4,4,399,1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(1,4,'Costco','https://www.costco.com','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAA+CAYAAACbQR1vAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAPgAAAAAAsxweAAAEiElEQVRoBd1aPWgUQRTOnZFLCF4kGNEkKCoWUSHpErSIlRhSCabQKunsLBTBIogpUgopBAtRG0WUYBkQLIKFwUIQLCKIAWN+iCYXT8QU3p3zwr3l5e3b2Z3931sIM2/mzffe983b2bu9NDWl8KrVah/Un9/roQmlnIlzFL7AMgpcjplTFx8DWxyUHMMci4u0LmcUJDYB0kCaCwIiRCqAIg34VR7YyV4+fv5X7e92u9O86XjP6rzrkkgEUMSvqMjP3KJ/Pzzo5hLqfOerB5XCYP8eChq6AG6lHjdpShb6vCqauYNfO+3EnXgFFkARLynw/VKA6vrG1krfiDgn+ScxFkgA3a7XSz3V5OEh4FsAJ/JJ3+OmVWQsgCL+VAW5ygNlgTg/AIGDkQCNsut08/LU0PUbkTzw9SSARP7n+K3FLJS9blNhzvUWkMjXiR9zA0/zPH4N0FaAIn+Ck2iEXaectAIoxy/UOcvkuz6/+UO5YN9RAF76/xaXRAAESnubL7a1STmKAnDysHDt7KgIIIFmaUwUgBPIculzLty2PQX47idFXvrUxpNHe+XMcLm6USqi7dbiEwD8dgmgyL90Wxz1vAlxzKXr06xF3nTDdr0QSXL3/RBHAaSWCtH9da6Say1Yb4JoBVhngCI/TIHWLo4tUDvKvht5SJhfKp+DupwoJiXP11gVkNTu00RpckCY2m59nj/6l6effCteHzuCNrQU2wrCAWgJ0cVh9iXyNDk/sTgPCYPG2BGAL8oqeSTL+eA4tJQ82NYZAEZcV+fs4x88Fk+Mz5vYdawbwhrbuWYTYPPaxDthYahDhf7eTgoYJnnEVZj36riX1NgE9NXVi/PY2m6BBMr/jkpsEhOKu83r7pcoksm3FysUN0nykIftFqDJRdHvWnhtfSCJAt8UM3YBVvtGfpsmaeoPVU0v3frYBaisb+yjCUGi1A7SR9IcQxcjdgF4cmHYiuALHUldjEQE4E8ap53TJQ5zZN2oF1/JJxEBpERgDAmp9pHkQ+Z3upIPjIHAXGT4ECD5JyYAT5AlN87Jgs18bGbp5tQS4u49fdLTYZvjwAhgQ49wQPpSZBJOypljOlUAvBHaVn8tJgHD9kUCPGldnJVTF7aqpXLgn9+blTKtvAp0gaOcQyE8xjAhf9kJ03YGmOyCE2jaxtUmzzjlZBPAyTFL4yabuCMAPyAOzc9sZolwkFzFCmg+2t0RBDRla7WPTyrAAE3cpIzourT1VXVTjrb0rEnl+N42m8EB042zBACu/CwwBcugXu4vRBpdhF0VIFUBjGVVBF7RUoXaBMiyCH42ShQgyyJIu6wbcxRAJ4IfpXVJJDmnFcBJBBgHETru37X9wpMkGRrby/0P/uJbEgqEfd03xlqlUl3uOecqJmJF0bYMDXw88Hy6D7FDFwCBdUKAj+FXWoQN3PLbMjIBIFMlwm3VTHnJOnRBWgrlnsU5619inHKIVAAMqoSYUP1JtNPSeiUP+Xo+A9zIud0abuvDmjchDzFDO7ggMF5hkfGIM4RxofW4Jn43qJAA19uoMv4Pwc8v/+cHQYEAAAAASUVORK5CYII=',NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(2,4,'Trader Joe''s','https://www.traderjoes.com','data:image/png;base64,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',NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(4,5,'Costco','costco.com',NULL,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(5,5,'Trader Joe''s','traderjoes.com',NULL,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(6,7,'Costco','costco.com',NULL,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(7,7,'Trader Joe''s','traderjoes.com',NULL,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(8,4,'Walmart','https://www.walmart.com','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAEDklEQVR4Ae1bS2sUQRDuXV95qEGDQSXxIoj4CxQfiOADJQoGI4qiqBiTS/wBwbM5SS4xih4E8SIaEDxEENFDchFzUEE0XhQRxJgE8yRoTJnUbm9P9Uz1TG/P7GMgdHd1ddX3fV3b0yGblOA+J75Wir9zk1z3WP3SqSrxsGGKgyEV6NT0ZS7QJ8kOjzb5ctRPFjpxdVM0QtACFBt5FIMQwStAsZLXiJArQLGTJ0TIClAq5BUR0jgu1XahAmLY/bn2PTmap7pe5YydDOYPxVgqQCUPZCmbCxFSovF1lVheN+EiGYeo00oY/lOZdknelcjsPLVLpmL5CLABOnAsC+BA5ESncF4B1wYuagXp6L+kncvXREok4A6A5Jy+ARaTOq8AJJuUdqkpEPXCEseuyZij4jGqADUZAAEbZZdB5qOvy2uKxUgAPyKmif1iBc3ZzMUWgJMUfMZaDwXhDz0/euUwq9o4WBEEW4Dez7txjW+7evkkC6RvEGISSNWsGCdmvKbHQ7m/aXo9shaj16CJspBCd0CuqfgtfrUcyaKY763teSpGZlbl2HBgKy/Gk1t2BcCidNdLeW1gH4BT4EemvUQp8rr1folNMRpVACamSOGcrtVVg87fRQ7IbXwPgEVI5sflo2Jd5SiYYnugcuDjE/YJJQAmq7v95H+3tmJM/GxpRLOTduOdXvF9ojZyrkgCYPbh6ZpMVYQpXYzDabH6OL4cn1BnACewLERY0DZiBGHNmwBBiZMyb/QaTApomzjKAthUsxBjWXkLUMRtHGA2YlDYZJv1Q1AGnZPI8E9ftuLIGKi+lQq4u79TXNgW/jZGAdPZUJj7Hw6Is30dOje2PZIACIadzaLjma3PBPzAE/aeAWtDCRAncQCtPognjBBGZ8Dmmm9i6PwpNb/veHK2QlR3L+yU7Iig0UaBH287KKqXsb7thmHElnsPxKfR+sw4qGN0DzAlD6Qo8vsa3nhw7a0f9NhWdvcZl/fHc6c9cfwMbAEGTrb6xfHMUTuKTs+PX8Vupn3R1J7pqx2/WKovjPub2ygzaWMLsH39ezKAaux5e8x419QY1BhEuDHYTE15bDs2vPPYdAajM0D93KpBuTulixN1PeLhxgF/dgVgcF1rklQXg2u3mctIACox2Cg7l0xYP11eUyzG9wDTBGEJctdFxWNUAVxQheTnXIDOXTe1+lzfeUs7l68Jo7eADRC6NwDGjlrSGIfbOq8ALjBXfmUBXCmd1DxpQfwXRVLBWscVx5el/Q45vznr5BcDxnIGUEQpW75Iy3HL/zEiq1GK/WwFAPsYvjUai+jSwZ8rQCmIIJEHul4BilkEhTxQpd8CC44z4FAkz6zuvkNXgMy60M8FYtdlesECyN6FIkYAaZnSP/ggJxXBVHTVAAAAAElFTkSuQmCC',NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(9,8,'Costco','https://www.costco.com','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAA+CAYAAACbQR1vAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAPgAAAAAAsxweAAAEiElEQVRoBd1aPWgUQRTOnZFLCF4kGNEkKCoWUSHpErSIlRhSCabQKunsLBTBIogpUgopBAtRG0WUYBkQLIKFwUIQLCKIAWN+iCYXT8QU3p3zwr3l5e3b2Z3931sIM2/mzffe983b2bu9NDWl8KrVah/Un9/roQmlnIlzFL7AMgpcjplTFx8DWxyUHMMci4u0LmcUJDYB0kCaCwIiRCqAIg34VR7YyV4+fv5X7e92u9O86XjP6rzrkkgEUMSvqMjP3KJ/Pzzo5hLqfOerB5XCYP8eChq6AG6lHjdpShb6vCqauYNfO+3EnXgFFkARLynw/VKA6vrG1krfiDgn+ScxFkgA3a7XSz3V5OEh4FsAJ/JJ3+OmVWQsgCL+VAW5ygNlgTg/AIGDkQCNsut08/LU0PUbkTzw9SSARP7n+K3FLJS9blNhzvUWkMjXiR9zA0/zPH4N0FaAIn+Ck2iEXaectAIoxy/UOcvkuz6/+UO5YN9RAF76/xaXRAAESnubL7a1STmKAnDysHDt7KgIIIFmaUwUgBPIculzLty2PQX47idFXvrUxpNHe+XMcLm6USqi7dbiEwD8dgmgyL90Wxz1vAlxzKXr06xF3nTDdr0QSXL3/RBHAaSWCtH9da6Say1Yb4JoBVhngCI/TIHWLo4tUDvKvht5SJhfKp+DupwoJiXP11gVkNTu00RpckCY2m59nj/6l6effCteHzuCNrQU2wrCAWgJ0cVh9iXyNDk/sTgPCYPG2BGAL8oqeSTL+eA4tJQ82NYZAEZcV+fs4x88Fk+Mz5vYdawbwhrbuWYTYPPaxDthYahDhf7eTgoYJnnEVZj36riX1NgE9NXVi/PY2m6BBMr/jkpsEhOKu83r7pcoksm3FysUN0nykIftFqDJRdHvWnhtfSCJAt8UM3YBVvtGfpsmaeoPVU0v3frYBaisb+yjCUGi1A7SR9IcQxcjdgF4cmHYiuALHUldjEQE4E8ap53TJQ5zZN2oF1/JJxEBpERgDAmp9pHkQ+Z3upIPjIHAXGT4ECD5JyYAT5AlN87Jgs18bGbp5tQS4u49fdLTYZvjwAhgQ49wQPpSZBJOypljOlUAvBHaVn8tJgHD9kUCPGldnJVTF7aqpXLgn9+blTKtvAp0gaOcQyE8xjAhf9kJ03YGmOyCE2jaxtUmzzjlZBPAyTFL4yabuCMAPyAOzc9sZolwkFzFCmg+2t0RBDRla7WPTyrAAE3cpIzourT1VXVTjrb0rEnl+N42m8EB042zBACu/CwwBcugXu4vRBpdhF0VIFUBjGVVBF7RUoXaBMiyCH42ShQgyyJIu6wbcxRAJ4IfpXVJJDmnFcBJBBgHETru37X9wpMkGRrby/0P/uJbEgqEfd03xlqlUl3uOecqJmJF0bYMDXw88Hy6D7FDFwCBdUKAj+FXWoQN3PLbMjIBIFMlwm3VTHnJOnRBWgrlnsU5619inHKIVAAMqoSYUP1JtNPSeiUP+Xo+A9zIud0abuvDmjchDzFDO7ggMF5hkfGIM4RxofW4Jn43qJAA19uoMv4Pwc8v/+cHQYEAAAAASUVORK5CYII=',NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(10,8,'Walmart','https://www.walmart.com','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAEDklEQVR4Ae1bS2sUQRDuXV95qEGDQSXxIoj4CxQfiOADJQoGI4qiqBiTS/wBwbM5SS4xih4E8SIaEDxEENFDchFzUEE0XhQRxJgE8yRoTJnUbm9P9Uz1TG/P7GMgdHd1ddX3fV3b0yGblOA+J75Wir9zk1z3WP3SqSrxsGGKgyEV6NT0ZS7QJ8kOjzb5ctRPFjpxdVM0QtACFBt5FIMQwStAsZLXiJArQLGTJ0TIClAq5BUR0jgu1XahAmLY/bn2PTmap7pe5YydDOYPxVgqQCUPZCmbCxFSovF1lVheN+EiGYeo00oY/lOZdknelcjsPLVLpmL5CLABOnAsC+BA5ESncF4B1wYuagXp6L+kncvXREok4A6A5Jy+ARaTOq8AJJuUdqkpEPXCEseuyZij4jGqADUZAAEbZZdB5qOvy2uKxUgAPyKmif1iBc3ZzMUWgJMUfMZaDwXhDz0/euUwq9o4WBEEW4Dez7txjW+7evkkC6RvEGISSNWsGCdmvKbHQ7m/aXo9shaj16CJspBCd0CuqfgtfrUcyaKY763teSpGZlbl2HBgKy/Gk1t2BcCidNdLeW1gH4BT4EemvUQp8rr1folNMRpVACamSOGcrtVVg87fRQ7IbXwPgEVI5sflo2Jd5SiYYnugcuDjE/YJJQAmq7v95H+3tmJM/GxpRLOTduOdXvF9ojZyrkgCYPbh6ZpMVYQpXYzDabH6OL4cn1BnACewLERY0DZiBGHNmwBBiZMyb/QaTApomzjKAthUsxBjWXkLUMRtHGA2YlDYZJv1Q1AGnZPI8E9ftuLIGKi+lQq4u79TXNgW/jZGAdPZUJj7Hw6Is30dOje2PZIACIadzaLjma3PBPzAE/aeAWtDCRAncQCtPognjBBGZ8Dmmm9i6PwpNb/veHK2QlR3L+yU7Iig0UaBH287KKqXsb7thmHElnsPxKfR+sw4qGN0DzAlD6Qo8vsa3nhw7a0f9NhWdvcZl/fHc6c9cfwMbAEGTrb6xfHMUTuKTs+PX8Vupn3R1J7pqx2/WKovjPub2ygzaWMLsH39ezKAaux5e8x419QY1BhEuDHYTE15bDs2vPPYdAajM0D93KpBuTulixN1PeLhxgF/dgVgcF1rklQXg2u3mctIACox2Cg7l0xYP11eUyzG9wDTBGEJctdFxWNUAVxQheTnXIDOXTe1+lzfeUs7l68Jo7eADRC6NwDGjlrSGIfbOq8ALjBXfmUBXCmd1DxpQfwXRVLBWscVx5el/Q45vznr5BcDxnIGUEQpW75Iy3HL/zEiq1GK/WwFAPsYvjUai+jSwZ8rQCmIIJEHul4BilkEhTxQpd8CC44z4FAkz6zuvkNXgMy60M8FYtdlesECyN6FIkYAaZnSP/ggJxXBVHTVAAAAAElFTkSuQmCC',NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO shops VALUES(11,8,'Trader Joes','https://www.traderjoes.com/','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAQRUlEQVR4Ad1ba3BdVRVe53FvHm1IQqBCKwjyENI0j5s2TWvlKVSLqOhop77QcRRGnWEApY6j43PUCj8ARRxHAWec0dIBUZHiCJRXH9LmnRaLQi0tIG3Tpk0fyb33nOP3rX3OzbnJTbhJA7Rdtzlnn73X3nuttddae+11Tq0AIG8ScGBLcM2K+Htel+c/fbMMtG+WsmxafMsVK2ArfraII74cTJZK1VWXyOy7vicybTpqfLHxezPBmmoB+KDW9gMZXL9RNi/5MgTAmsmBZVky6Fiy4D9PiFd9sjhGopMbbIxeUyIAD4M7VKQjh6Vt5kKsLCmdeqAwWl/fKHbChd7YEO7Rw1EJwBMPjDvidW6RzouXClfszQfMAQGn+tolSNjQrwDm40x62qMSgJ8elPaaueLaJOStA4qZOuZh3nl9HbC5yQt+UgKg39w4Y764mUOgZPLSnxKRWZ64ixZI/cO/mdRwExJAll7Z96WjKiW+C7un8R8D4EL9MiCmqb8bnmFiCzKBPcaXA/c8qCpPUz9WmKf8s+DCgiZ2VNeLDA5CK4s3yKI1YH3jEinZtvMYWO/xSfDhGOsfvU+ScxvHRwxb31gD4G3WzrrouGCePNkZX3quuFYGVv2tKAG8gQb4srZuiZTteLWowY41pPpnV4o753yQNbZfGFsDsPK77/zdccs8F6N70VKRNBgZxyeMrQGZIdk0Yx68/rG2rhOjJ/BtaTjQIe4YQVpBAXCf765qQJx3YoAPTubu31yQmYImsK6mUbKTD64KTvR2VlqWI9tu+mFBEvIE4DGgPXBYpnke9tWC+MdlJXkZ+O0foQej7TnfBHCM3VjVKM6JxH1syWz4gcb+rlgNts3cE6S0/4HVUoIkxYkKrocEDEL5OAxrABra4fhwpo23n3Bl33VkLk+QIeQ0wN/5ygnPPHl2soH4jAtCH6cagJSddFXWIcOSk0con7fmVsjfMnbLV9apoYX6nZ5xqrT8+3HNKOFQK+KCgjzmNaWVbwqMDSwkHvhjuRDYaPdHtGk/nSrqwcnyxz5iZXXcGIaUI2mKwaIqrBjL+f2iRiZWmY0aPVeEwSnDBCyqErt3Y5eDeC1bVAA7v3trDhMKIs0HevEcm1yfLGmvnI1sLtr3bxmDFEs2VTdoUjQa0A5wTh+IByEcpw7Nw9q2aC/mQ3YnDppnPJSRzpnNqgln33erVH9scRxluHw4Le2nz9MhUyO8fITEYKi3ar5kg4x44EGGoPelSRPp9t3xe8VjBrf82g+HfSjt4T+WBk6tFjsolb57HjBt2DHaqmrFe+l1fabIUn+7N2+hAithcMOxNA0Oyceho2pO+AjC9g8KHbUeX6YlpLH3UW17+fPfwN3QQ08eZCAiXSNQXV6iOAFW+eXv3J7Da69slMFNW/SZaz1782rFS/qWrK//oJZtG4N44WpncT/39u/K3+vfL4/UNCsCL4+eeZH8dWaLvG/rGjz5sv2G75nJlZ6EdDVdSTQNnp754nKjrVqDRPElWBmAnwkrIDQ3PSLIRqTG5CbfArS/qxUrVY+VMvj+GTPxWoGrZoTGlew5uVk6TklB2+rkHzNSJmiD+fHc0nfnfeFEpDSQ3suX5UzpuS/cpG0I8yT5v11ab0fMs6UUHbpqFsqp23fJadkcxXLa/n6ZeWhI2j7yBXEgPdpwEAZLDmLm5Gc/hp4YDytT+QrsS6cxlwV//rUW9txxryEEjec8vSoPh31t7NE2Rgl8T8PwbgiBg5Lt5idXQvPoX3yxfEcyvMNkvMCVGqhyJ8wuz1+YqYETiHfZfAyCSSHzkn92hy1kwUImCYtx4PcP5SqHbFdcLBUEKThEKVNUOxdM+xjMfaZb0vAaNp6NE3FkzkCXqqsPW+84uYmyyUECtmZj5SjKnd+/XV788c9l/t42mT63FjVEJOshpDFvWSJPMFGTU1+nvkeAIyUl0rwPjIC+NafUSWUGYos5Xogm6ibNe3t0GppdLzRmJFhIntjPL/9Jrp4qROYVHEeH4nBpZh1DcFDkTsBssOdh4MoGrBoYAeeuN4xH9H0XXqC96AUaD3RJa18b6DYEZkeE2wFe+7ClHy8/KBjwZWSEm5emMgOSpC+QzpqUPFs9G3nJyPajUdHTH1K5UrM7K+BsSRp+foBc4QgIenvFTkK1C8HpP7glV13+JdhRDJR4EGjvPaQTPD37cqioLeesvEM1JUK96NlVWiTRXddcJ1YGKxguevOeDlV5IlD5rURSBXAZ3vzwvc98vPjgu0HCukVLtM7yE2qCvgxJOUyhAtoaQMNm/eLbiseLY0NKvB9Bb8eWx2e1YM5Aap+8X+vjl96bV4jt5LxTvElk5vWfyFW852fLc2V62vNX/kKf/coknFMgVTt362pNv+piqLzurMonaFR4El7ef3KtdNTMQ72RgIWQNNI3L7ba4pRIfT+3YRdiYYNIxQuvwV7husBQVtXUUbWf071amvs75JTPfBQvSRRVzlrxLS2kEzj7QZmqj3DlLUk0cOvNh3TvFvqWsGesTUmEP4jAuCfzRM2tuvIifbCTSWXHs0NOQXRq1wa0WTLrx1/nuipeFRycBQ3xGHFte1X7sKXxtU3a7iMQygGHYmNI1jMLr4FWoT9z3wAX4zTt70Qs0iMudggiu5A05QIvJdVfWqr9k24SJonBVIngAbFwqb5OHSO62EN4wxh3Wmzg3LX03FAbOhfzhzTB9CrTDx6YAlLHg3akDvg0jIsV7DulQk776mdzdXvOPFn7ksjOhsXAxhjsW16G+XyZ9++ntD1+GQLWGqhv+eZtWp16ea0Zj7NjR6Am4aZ1A09R6HTOMAk464juA5CZiQBNlIhzvhysPQ9zkkvggwarvaIuoFpHwBL3YyhZVKV37r8MHekE4/h0XZ6d1VUgInuZ0SgZoxlKLBtDcLCzB0LXaJwaNUyjM+4aZA4DOFg9Rp05AI2MWQpBBtM4cMhc5TiOT3XFP4eLhliD4GCbTdPBg3kNhR0wRXIiYImrEps6bII40QhtBgzjs2xjzzR6YVBNK1U2jmfaeMXbvLw2DYGIyi8lAKSbzFMQ3G2w38CLE6sw5N5SjcQJpzdBlHnwET8o8xjKxwQ2vtUoPOoYtaRJj5PQZ1U3qlz4R18QzglJO5JAYMQJGVsM0f4BZCPDIAYOjfxGfaO7A+EkQpKadz8HW++Qhr5/al8bwrCwggP4y3zmQ5KZfR7GYYwCquBHfBWsohZ1ySbhNRwQo/t4UV3IAGwHWtO0E0RNow1HgHRaBWJ6qBe/5Gjob0c51qofT8zLCSa1fzgqi0bg3Qdz3dUMwyEFbI2EwC2DljmIRwJp2bdZ67QeF2qLEoF7O6PHCcC0piZoQHnpBLoMo7bNwskqt95Z6f7cTdhTsaSgqGEf8m4x5tnLKiuXxj3d6GHUPPCN51cf2j+gmkHx2tQirRTZXDEPc+AzDOBaGLdln/Hi5LnvTw/JWpwqsy+8oERtv+0uvU/kUrvim2LPxmUyQGfz4tIbw67wAX99Qvfd+l+uMCtSYFAb2mF0iFezzbYhCbvp7PdKW3WjbER0F4D7I66J2gadIbzrw84BnKwbSgUjUK9e/twPpBzC7Gr9pGQzgez+0cQFYDe+R+xpy64uQGpxVYcffsIgIgrxEQ7T2yaWfkAp3HhSI47K9dJTUS+Zf21VPKpraq9Zxf/edqfWZS84X3eWg4kEPLirL2TKYesExg4dp6agTDBTs99qPS9lX8EnOcSBn+lp+RBEMRy35JDeqAB6bMuZWEcqcMmFZ+nQgQMjgOcNuMETlCKMirM6dx0yzJi+c8HHTTPa6bBQLa98/26tW7jhfgQ23XLJa+sU3wMrfrh9EiHy2JaVlDR+EVywYrl+EHHe6vskeGlHVF30nXRDrsYgzTFk/L4unNO77r9DGhGFZTdvV+SMlGigYXEkQBAkYAbgEo41GXu1ZPNzkgiwvXHfd6EthA2XfgoZokY5tGZdhFHw7iEU7qmEc2TYTQkSMFXFwpQMVE7Uj/mSPnMmIxsjgHcuv07HG+tS9a3rND6vWXyp6YLvcnj4ad0PTw/IQDiEBJwVAxk6wIyb0XXkxnjuvbdqO+m2Dh7RYCX4AMfCAa+dcb8vWz9+gwrm8EnT5EhNGHUqhrkkEYAkr18mnbVXqMB4xI5g0fYNUbGoO7fm+V0PK32aFeY22MGkwjiQgazmY/ULwe7frJIdN/9QAxf7soXS9OCvFI1qRmA4qoBF160Kj6ldEF6JK+suXSYVbT1yZG6dtDz+R3WknWEyxHQKu154rjSvfwA5h1o5DPNatOf5XDNn6agsfgukPtbB7Ki3qpvUYB8XO1TL3MixQhKrdHh9h5QvaIrVUhsDZZ6VtHn7sbXYtqAEfGaAEgJ1xBk8zEqUEFiXmM+ZFq75Q4Sid7g74GCAMCpkJb1G07qVKsjUvmHGo47B9tej4hve6WEOnXGGaiFNyBgvSnO3PKZTjTUCpfz8B69FduQgiDMqn8UKd1XnC8TDanfhY6UA2VfyQktnmOyt60bmthUlxPuo1KMuGzlw7C/AGdbxYj4DzUMOskU8cSKDQ1yi650OGObXOecK1hQFFvzUgt7VlKqCmoCWaAY8t2OFhtctf0yGqPTq0WnKsFYY2/h6HmxsKUW/Icb2GI4uAkd1SIDnjVD+sWl4UMpQS2IawA8iy5AlzTD4gCAYLVLD6HAtnEMC+KRiQClF/6Z9bUA3c+coCKCu5626HczlqkaNqWkq1FLtza8w8+zIncWslC+DIfOsp5nwaA93GWpHpCXmnqFVxphnHwd7fZrnDZS54pyVygM1K5p5onsQepO+FxzmMVfioNMXvx8DD++17HQige5LOY4NZ/mPEHEzc3JMCZ9w4EvrrtG7WD6nUAOrdBo+Oz3huJfTbvkaEq+jTXbYCcZ5hkM0+/XoDnG046YM20/x/WMBdvI1IOIIDjHVvzFyY1HtcXm3cYhK9RVmngwVFoC2lMo5d/8UAcPxaw/chxr4edzYXI7XJHLSsqtksPYsk3I6ztafidumzkdM4DkO7ePIBr1gM60bHpShqtGHk3HGPAaaLJnz0F0SnH1GQbuPEzi+ABTTkpZtT0m2efzDUnzQt7PMs0Tjcw9K4uJFhXzeKNIK7wKj0BjZIZx95HHZuuxGPUcXQHnbqxgxNvCNsAvVLeDxCxFYtABMZ8TciMk7a5oQMRY5Q6FZ34Q6vp6f2z++wys0bREmEO+GHcF18bVljwSlCcThb78Q+KaqbOnV5mPoCXJDziaoAXFhoDyIr0ZmtCIBxJMdjeStAYqdx+o0TnYtSLKOesE5ATKOTgDhRMGO16S7DtlgEJX/wdsEKCkS1cFJMW1lZN4e2Dr+f9DRwpQIIEeEl5Y2fMDEt3nmTR714uiIpF7xXSWP1+nSMvzX2eem1PtMrQBgjzxIWh7S5Vt3SteCq0H6cPokJ6giC8wpZpMJmb/jWfFKS2BqUx+VTq0ARjIGBpi1YSJH+vvlhZt/JAN/eRpfhA0hk4M0GfGBw6Qpf4P43u8d139K3n0LstQlZSpMzVNqHnHk4FPz/H8ZTIBXzI1BlAAAAABJRU5ErkJggg==',NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(1,4,'2026-06-28',1,1,2,'planned',1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(2,4,'2026-06-28',1,2,1,'cooked',1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(3,4,'2026-06-28',3,1,4,'planned',1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(4,4,'2026-06-29',1,2,2,'planned',1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(5,5,'2026-06-28',4,3,2,'planned',1782688038);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(6,5,'2026-06-28',4,4,1,'planned',1782688038);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(7,5,'2026-06-28',6,3,4,'planned',1782688038);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(8,6,'2026-06-28',7,5,2,'planned',1782688143);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(9,6,'2026-06-28',9,5,4,'planned',1782688143);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(10,7,'2026-06-28',10,6,2,'planned',1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_events VALUES(11,7,'2026-06-29',10,6,4,'planned',1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(1,4,'Breakfast',0);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(2,4,'Lunch',1);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(3,4,'Dinner',2);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(4,5,'Breakfast',0);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(5,5,'Lunch',1);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(6,5,'Dinner',2);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(7,6,'Breakfast',0);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(8,6,'Lunch',1);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(9,6,'Dinner',2);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(10,7,'Breakfast',0);
--> statement-breakpoint
INSERT OR IGNORE INTO meal_slots VALUES(11,7,'Dinner',2);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(1,1,1,300);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(2,1,2,400);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(3,1,3,2);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(4,1,4,30);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(5,2,3,2);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(6,2,4,10);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(7,3,7,300);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(8,3,8,400);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(9,3,9,2);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(10,4,9,2);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(11,5,11,300);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(12,6,12,300);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(13,6,13,400);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(14,6,14,2);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(15,6,15,30);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(16,7,14,2);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(17,7,15,10);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_ingredients VALUES(18,8,15,40);
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_media VALUES(1,1,'youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_media VALUES(2,6,'youtube','https://www.youtube.com/watch?v=dQw4w9WgXcQ');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(1,1,0,'Whisk dry ingredients.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(2,1,1,'Beat in milk and eggs until just combined.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(3,1,2,'Cook on a buttered griddle until bubbles form, then flip.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(4,1,3,'Serve hot with syrup.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(5,2,0,'Beat eggs.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(6,2,1,'Melt butter, pour in eggs.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(7,2,2,'Fold and serve.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(8,3,0,'Whisk dry.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(9,3,1,'Beat in milk & eggs.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(10,3,2,'Cook on griddle.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(11,4,0,'Beat.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(12,4,1,'Cook.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(13,5,0,'Mix');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(14,6,0,'Whisk the dry ingredients together.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(15,6,1,'Beat in milk and eggs until just combined.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(16,6,2,'Cook on a buttered griddle until bubbles form, then flip.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(17,6,3,'Serve hot with syrup.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(18,7,0,'Beat eggs.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(19,7,1,'Cook in butter.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(20,7,2,'Fold.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipe_steps VALUES(21,8,0,'Roast.');
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(1,4,'Sunday Pancakes',2,'Fluffy weekend stack.',1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(2,4,'Two-egg Omelet',1,NULL,1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(3,5,'Sunday Pancakes',2,'Fluffy weekend stack.',1782688038);
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(4,5,'Two-egg Omelet',1,NULL,1782688038);
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(5,6,'Sunday Pancakes',2,NULL,1782688143);
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(6,7,'Sunday Pancakes',2,'Fluffy weekend stack — whisk the dry, fold in milk and eggs, cook until the bubbles set.',1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(7,7,'Two-egg Omelet',1,NULL,1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO recipes VALUES(8,7,'Sheet-pan Chicken',4,NULL,1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(1,4,1,8000,'manual',NULL,NULL,1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(2,4,2,150,'manual',NULL,NULL,1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(3,4,3,18,'manual',NULL,NULL,1782675701);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(4,5,7,8000,'manual',NULL,NULL,1782688039);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(5,5,8,150,'manual',NULL,NULL,1782688039);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(6,5,9,18,'manual',NULL,NULL,1782688039);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(7,7,12,100,'manual',NULL,NULL,1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(8,7,13,50,'manual',NULL,NULL,1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(9,7,14,1,'manual',NULL,NULL,1782688352);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(10,4,3,-2,'cooked',2,NULL,1782689063);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(11,4,4,-10,'cooked',2,NULL,1782689063);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(12,8,16,50,'manual',NULL,NULL,1782690293);
--> statement-breakpoint
INSERT OR IGNORE INTO stock_movements VALUES(13,8,16,-50,'manual',NULL,NULL,1782690296);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(1,4,1,1,'Kirkland AP Flour 25 lb',11340,1,1,NULL,1782675700,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(2,4,2,2,'Whole Milk, 1 gal',3785,1,1,NULL,1782675701,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(3,4,3,1,'Eggs, 24 ct',24,1,1,NULL,1782675701,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(4,4,4,2,'Butter, 1 lb',454,1,1,NULL,1782675701,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(5,5,7,4,'Kirkland AP Flour 25lb',11340,1,1,NULL,1782688038,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(6,5,8,5,'Whole Milk 1 gal',3785,1,1,NULL,1782688038,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(7,7,12,6,'Kirkland AP Flour 25lb',11340,1,1,NULL,1782688351,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(8,7,14,6,'Eggs 24 ct',24,1,1,NULL,1782688352,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(9,7,13,7,'Whole Milk 1 gal',3785,1,1,NULL,1782688352,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(10,7,15,7,'Butter 1 lb',454,1,1,NULL,1782688352,NULL,NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO products VALUES(11,8,16,9,'Kirkland Signature Organic 1% Low Fat Milk , 64 fl oz, 3-count',1890,100,1,'https://www.instacart.com/products/195869-kirkland-signature-organic-1-lowfat-milk-192-oz?retailerSlug=costco',1782690137,'https://www.instacart.com/assets/domains/product-image/file/large_46143d7f-a2b6-418b-b99f-9a820209616f.jpeg',1330);
